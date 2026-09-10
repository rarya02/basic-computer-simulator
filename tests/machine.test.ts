// Textbook behavior the golden traces cannot cover, because the Python reference
// either lacks the hardware (I/O, interrupts) or implements it incorrectly.
import { describe, expect, test } from "vitest";
import { assemble, Machine } from "../core/index.ts";
import type { StepEvent } from "../core/index.ts";

function boot(lines: string[], entry?: number): Machine {
  const result = assemble(lines.join("\n"));
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const machine = new Machine();
  machine.load(entry === undefined ? result : { ...result, entry });
  return machine;
}

function runToHalt(machine: Machine): StepEvent[] {
  const events: StepEvent[] = [];
  while (events.length < 10_000) {
    const event = machine.step();
    events.push(event);
    if (event.halted) return events;
  }
  throw new Error("machine did not halt");
}

describe("step events", () => {
  test("report T-state, RTL, bus source and memory access", () => {
    const machine = boot(["ORG 10", "LDA X", "HLT", "X, HEX 1234", "END"]);
    const events = Array.from({ length: 6 }, () => machine.step());

    expect(events.map((e) => [e.t, e.bus, e.microops, e.memoryRead, e.memoryWrite])).toEqual([
      [0, "PC", ["AR ← PC"], null, null],
      [1, "M", ["IR ← M[AR]", "PC ← PC + 1"], { address: 0x10, value: 0x2012 }, null],
      [2, "IR", ["D0, ..., D7 ← Decode IR(12-14)", "AR ← IR(0-11)", "I ← IR(15)"], null, null],
      [3, null, [], null, null],
      [4, "M", ["DR ← M[AR]"], { address: 0x12, value: 0x1234 }, null],
      [5, null, ["AC ← DR", "SC ← 0"], null, null],
    ]);
    expect(machine.state).toMatchObject({ AC: 0x1234, SC: 0 });
  });

  test("stepping a halted machine changes nothing", () => {
    const machine = boot(["HLT", "END"]);
    runToHalt(machine);
    const before = machine.state;
    const cycles = machine.cycles;

    expect(machine.step()).toMatchObject({ halted: true, microops: [], cycle: cycles });
    expect(machine.state).toEqual(before);
    expect(machine.cycles).toBe(cycles);
  });
});

describe("memory reference", () => {
  test("indirect addressing fetches the effective address at T3", () => {
    const machine = boot(["ORG 100", "LDA PTR I", "HLT", "PTR, HEX 200", "ORG 200", "HEX BEEF", "END"]);
    const events = runToHalt(machine);

    expect(events[3]).toMatchObject({ t: 3, bus: "M", microops: ["AR ← M[AR]"], memoryRead: { address: 0x102, value: 0x200 } });
    expect(machine.state.AC).toBe(0xbeef);
  });

  test("a subroutine returns through BUN SUB I", () => {
    const machine = boot(["ORG 100", "BSA SUB", "STA RES", "HLT", "RES, HEX 0", "SUB, HEX 0", "INC", "BUN SUB I", "END"]);
    const events = runToHalt(machine);

    expect(events.find((e) => e.microops.includes("M[AR] ← PC"))).toMatchObject({
      bus: "PC",
      memoryWrite: { address: 0x104, value: 0x101 },
    });
    expect(machine.peek(0x103)).toBe(1);
  });
});

describe("register reference", () => {
  test("CIL moves AC(15) into E and E into AC(0)", () => {
    const machine = boot(["LDA X", "CME", "CIL", "HLT", "X, HEX 8001", "END"]);
    runToHalt(machine);
    expect(machine.state).toMatchObject({ AC: 0x0003, E: 1 });
  });
});

describe("input and output", () => {
  test("INP fills AC(0-7) from INPR and OUT drives AC onto the bus into OUTR", () => {
    const machine = boot(["LDA X", "INP", "OUT", "HLT", "X, HEX AB00", "END"]);
    machine.input(0x41);
    const events = runToHalt(machine);

    expect(machine.state).toMatchObject({ AC: 0xab41, OUTR: 0x41, FGI: 0, FGO: 0 });
    expect(events.find((e) => e.microops.includes("OUTR ← AC(0-7)"))).toMatchObject({
      bus: "AC",
      microops: ["OUTR ← AC(0-7)", "FGO ← 0", "SC ← 0"],
    });
  });

  test("SKI and SKO skip only when their flag is set", () => {
    const machine = boot(["SKI", "INC", "SKO", "INC", "HLT", "END"]);
    runToHalt(machine);
    expect(machine.state).toMatchObject({ AC: 1, FGI: 0, FGO: 1 });
  });
});

describe("interrupt cycle", () => {
  test("is taken after the instruction following ION and vectors through address 1", () => {
    const lines = ["ORG 0", "ZRO, HEX 0", "BUN SRV", "ORG 100", "ION", "INC", "INC", "HLT", "SRV, HLT", "END"];
    expect(assemble(lines.join("\n")).entry).toBe(1);

    const machine = boot(lines, 0x100);
    const events = runToHalt(machine);

    expect(events.find((e) => e.microops[0] === "IEN ← 1")?.microops).toEqual(["IEN ← 1", "SC ← 0"]);
    expect(events.find((e) => e.microops[0] === "AC ← AC + 1")?.microops).toEqual(["AC ← AC + 1", "SC ← 0", "R ← 1"]);
    expect(events.filter((e) => e.interrupt).map((e) => [e.t, e.bus, e.microops, e.memoryWrite])).toEqual([
      [0, "PC", ["AR ← 0", "TR ← PC"], null],
      [1, "TR", ["M[AR] ← TR", "PC ← 0"], { address: 0, value: 0x102 }],
      [2, null, ["PC ← PC + 1", "IEN ← 0", "R ← 0", "SC ← 0"], null],
    ]);
    expect(machine.state).toMatchObject({ AC: 1, PC: 0x105, TR: 0x102, R: 0, IEN: 0 });
  });
});
