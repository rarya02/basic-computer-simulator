import { describe, expect, test } from "vitest";
import { BreakpointStore } from "../web/src/breakpoint-store.ts";
import { compile, compileCondition, describeBreakpoint, isBreakpoint, parseAddress, parseValue } from "../web/src/breakpoints.ts";
import type { Breakpoint } from "../web/src/breakpoints.ts";
import { readWorkspace, writeWorkspace } from "../web/src/storage.ts";
import { boot } from "./programs.ts";

const condition = (expression: string) => {
  const compiled = compileCondition(expression);
  if (!compiled.ok) throw new Error(`expected '${expression}' to compile: ${compiled.message}`);
  return compiled.test;
};

const fakeStorage = () => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
  };
};

describe("parsing", () => {
  test("addresses are hex, with or without a prefix", () => {
    expect([parseAddress("110"), parseAddress("0x110"), parseAddress(" fff "), parseAddress("0")]).toEqual([0x110, 0x110, 0xfff, 0]);
    expect([parseAddress("1000"), parseAddress(""), parseAddress("zz"), parseAddress("-1")]).toEqual([null, null, null, null]);
  });

  test("condition operands follow JavaScript, so a bare number is decimal", () => {
    expect([parseValue("0x110"), parseValue("110"), parseValue(" 42 ")]).toEqual([0x110, 110, 42]);
    expect([parseValue("0b10"), parseValue("4.5"), parseValue("AC")]).toEqual([null, null, null]);
  });
});

describe("conditions", () => {
  test("compare a register with a number", () => {
    const machine = boot(["ORG 110", "CLA", "HLT", "END"].join("\n"));
    expect(condition("AC == 0")(machine.state)).toBe(true);
    expect(condition("PC >= 0x110")(machine.state)).toBe(true);
    expect(condition("PC > 0x110")(machine.state)).toBe(false);
    // 272 is 0x110 in decimal, so a bare number really is read as decimal.
    expect(condition("PC == 272")(machine.state)).toBe(true);
  });

  test("compare two registers, and read flip-flops", () => {
    const machine = boot(["ORG 10", "LDA X", "HLT", "X, HEX 5", "END"].join("\n"));
    while (machine.state.AC === 0) machine.step();

    expect(condition("AC == DR")(machine.state)).toBe(true);
    expect(condition("ac==dr")(machine.state)).toBe(true);
    expect(condition("S == 1")(machine.state)).toBe(true);
    expect(condition("E != 0")(machine.state)).toBe(false);
  });

  test("report what is wrong instead of failing silently", () => {
    expect(compileCondition("AC = 0")).toEqual({ ok: false, message: "write a comparison such as AC == 0 or PC >= 0x110" });
    expect(compileCondition("")).toEqual({ ok: false, message: "write a comparison such as AC == 0 or PC >= 0x110" });
    expect(compileCondition("XY == 0")).toEqual({ ok: false, message: "'XY' is not a register or flip-flop" });
    expect(compileCondition("AC == frog")).toEqual({
      ok: false,
      message: "'frog' is not a register, a decimal number, or hex such as 0x110",
    });
  });
});

describe("address breakpoints", () => {
  test("fire only when the machine is about to fetch that address", () => {
    const machine = boot(["ORG 100", "INC", "INC", "HLT", "END"].join("\n"));
    const states: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      states.push(compileAt(0x101)(machine.state));
      machine.step();
    }
    // True only after the first INC finishes, with SC back at 0 and PC at 101.
    expect(states).toEqual([false, false, false, false, true, false, false, false]);
  });
});

const compileAt = (address: number) => {
  const compiled = compile({ id: "bp", enabled: true, kind: "address", address });
  if (!compiled.ok) throw new Error("address breakpoints always compile");
  return compiled.test;
};

describe("the breakpoint store", () => {
  test("adds, toggles and removes, telling listeners each time", () => {
    const store = new BreakpointStore();
    let changes = 0;
    store.onChange(() => changes++);

    const added = store.addAddress(0x110);
    expect(added).toMatchObject({ ok: true });
    expect(store.addAddress(0x110)).toEqual({ ok: false, message: "address 110 already has a breakpoint" });
    expect(store.addCondition("AC == 0")).toMatchObject({ ok: true });
    expect(store.addCondition("AC == 0")).toEqual({ ok: false, message: "'AC == 0' is already a breakpoint" });
    expect(store.addCondition("nope")).toMatchObject({ ok: false });

    const id = store.items[0]?.id ?? "";
    store.toggle(id);
    expect(store.items[0]?.enabled).toBe(false);
    store.remove(id);
    expect(store.items.map(describeBreakpoint)).toEqual(["AC == 0"]);
    expect(changes).toBe(4);
  });

  test("clicking the same address twice removes the breakpoint", () => {
    const store = new BreakpointStore();
    store.toggleAddress(0x110);
    expect(store.hasAddress(0x110)).toBe(true);
    store.toggleAddress(0x110);
    expect(store.hasAddress(0x110)).toBe(false);
  });

  test("restoring drops anything that is no longer a valid breakpoint", () => {
    const store = new BreakpointStore();
    store.replaceAll([
      { id: "bp-4", enabled: true, kind: "address", address: 0x110 },
      { id: "bp-5", enabled: false, kind: "condition", expression: "AC == 0" },
      { id: "bp-6", enabled: true, kind: "condition", expression: "AC = 0" },
      { id: "bp-7", enabled: true, kind: "address", address: 0x1000 },
      { kind: "address", address: 2 },
      "nonsense",
      null,
    ]);

    expect(store.items.map((item) => item.id)).toEqual(["bp-4", "bp-5"]);
    // Ids keep counting past the restored ones so they stay unique.
    store.addAddress(0x111);
    expect(store.items.at(-1)?.id).toBe("bp-6");
  });
});

describe("the saved workspace", () => {
  test("round trips the source, program and breakpoints", () => {
    const storage = fakeStorage();
    const breakpoints: Breakpoint[] = [{ id: "bp-1", enabled: true, kind: "address", address: 0x110 }];
    writeWorkspace(storage, { source: "CLA\nEND", program: "multiply", breakpoints });

    expect(readWorkspace(storage)).toEqual({ source: "CLA\nEND", program: "multiply", breakpoints });
  });

  test("treats missing, corrupt or foreign contents as no workspace", () => {
    const storage = fakeStorage();
    expect(readWorkspace(storage)).toBeNull();
    expect(readWorkspace(null)).toBeNull();

    storage.entries.set("mano-basic-computer.workspace", "{not json");
    expect(readWorkspace(storage)).toBeNull();

    storage.entries.set("mano-basic-computer.workspace", JSON.stringify({ program: "multiply" }));
    expect(readWorkspace(storage)).toBeNull();

    storage.entries.set("mano-basic-computer.workspace", JSON.stringify({ source: "CLA", breakpoints: ["junk"] }));
    expect(readWorkspace(storage)).toEqual({ source: "CLA", program: "", breakpoints: [] });
  });

  test("survives storage that refuses to write", () => {
    const angry = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readWorkspace(angry)).toBeNull();
    expect(() => writeWorkspace(angry, { source: "CLA", program: "", breakpoints: [] })).not.toThrow();
  });
});
