import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FLIP_FLOPS, REGISTERS } from "../core/index.ts";
import type { Change, StepEvent } from "../core/index.ts";
import { boot, goldenDir, memoryImage, programNames, readProgram, runToHalt } from "./programs.ts";

function groupByInstruction(events: readonly StepEvent[]): StepEvent[][] {
  const groups: StepEvent[][] = [[]];
  for (const event of events) {
    groups.at(-1)?.push(event);
    if (event.endsInstruction) groups.push([]);
  }
  return groups.filter((group) => group.length > 0);
}

const FETCH = [["AR"], ["IR"], ["AR"]];

describe("loads", () => {
  test("name every unit whose LD input is enabled in each cycle", () => {
    const machine = boot([
      "ORG 10",
      "LDA A", "AND A", "ADD A", "STA B", "ISZ B", "BSA SUB",
      "LDA PTR I", "OUT", "INP", "HLT",
      "A, HEX 00FF", "B, HEX 0", "PTR, HEX 10",
      "SUB, HEX 0", "CMA", "CIR", "CIL", "CLA", "INC", "BUN SUB I",
      "END",
    ].join("\n"));

    expect(groupByInstruction(runToHalt(machine)).map((group) => group.map((e) => e.loads))).toEqual([
      [...FETCH, [], ["DR"], ["AC"]], // LDA A
      [...FETCH, [], ["DR"], ["AC"]], // AND A
      [...FETCH, [], ["DR"], ["AC"]], // ADD A
      [...FETCH, [], ["M"]], // STA B
      [...FETCH, [], ["DR"], [], ["M"]], // ISZ B
      [...FETCH, [], ["M"], ["PC"]], // BSA SUB
      [...FETCH, ["AC"]], // CMA
      [...FETCH, ["AC"]], // CIR
      [...FETCH, ["AC"]], // CIL
      [...FETCH, []], // CLA
      [...FETCH, []], // INC
      [...FETCH, ["AR"], ["PC"]], // BUN SUB I
      [...FETCH, ["AR"], ["DR"], ["AC"]], // LDA PTR I
      [...FETCH, ["OUTR"]], // OUT
      [...FETCH, ["AC"]], // INP
      [...FETCH, []], // HLT
    ]);
  });

  test("the interrupt cycle loads TR from the bus, then writes memory", () => {
    const lines = ["ORG 0", "ZRO, HEX 0", "BUN SRV", "ORG 100", "ION", "INC", "HLT", "SRV, HLT", "END"];
    const events = runToHalt(boot(lines.join("\n"), 0x100));
    expect(events.filter((e) => e.interrupt).map((e) => e.loads)).toEqual([["TR"], ["M"], []]);
  });
});

describe("endsInstruction", () => {
  test.each(programNames)("%s: marks the same cycles the Python trace ends instructions on", (name) => {
    const golden = readFileSync(join(goldenDir, `${name}.trace`), "utf8").split(/\r?\n/).filter(Boolean);
    const expected = golden.map((_, i) => i === golden.length - 1 || golden[i + 1]?.split(" ")[1] === "T0");

    expect(runToHalt(boot(readProgram(name))).map((e) => e.endsInstruction)).toEqual(expected);
  });

  test("is false for the interrupt cycle and for stepping a halted machine", () => {
    const lines = ["ORG 0", "ZRO, HEX 0", "BUN SRV", "ORG 100", "ION", "INC", "HLT", "SRV, HLT", "END"];
    const machine = boot(lines.join("\n"), 0x100);
    const events = runToHalt(machine);

    expect(events.filter((e) => e.interrupt).map((e) => e.endsInstruction)).toEqual([false, false, false]);
    expect(events.filter((e) => e.endsInstruction)).toHaveLength(4); // ION, INC, BUN SRV, HLT
    expect(machine.step().endsInstruction).toBe(false);
  });
});

describe("changes", () => {
  test.each(programNames)("%s: list exactly the values that differ after each cycle", (name) => {
    const machine = boot(readProgram(name));
    let state = machine.state;
    let memory = memoryImage(machine);

    for (;;) {
      const event = machine.step();
      const nextState = machine.state;
      const nextMemory = memoryImage(machine);

      const expected: Change[] = [];
      for (const unit of [...REGISTERS, ...FLIP_FLOPS]) {
        if (state[unit] !== nextState[unit]) {
          expected.push({ kind: "register", name: unit, before: state[unit], after: nextState[unit] });
        }
      }
      nextMemory.forEach((after, address) => {
        const before = memory[address] ?? 0;
        if (before !== after) expected.push({ kind: "memory", address, before, after });
      });

      expect(event.changes, `cycle ${event.cycle}`).toEqual(expected);
      state = nextState;
      memory = nextMemory;
      if (event.halted) break;
    }
  });

  test("a load that writes the value already held is not a change", () => {
    const machine = boot(["ORG 10", "LDA X", "STA X", "HLT", "X, HEX 1234", "END"].join("\n"));
    const sta = groupByInstruction(runToHalt(machine))[1]?.at(-1);

    expect(sta).toMatchObject({ loads: ["M"], memoryWrite: { address: 0x13, value: 0x1234 } });
    expect(sta?.changes.filter((c) => c.kind === "memory")).toEqual([]);
  });
});
