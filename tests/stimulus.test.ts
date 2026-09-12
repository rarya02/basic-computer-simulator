import { describe, expect, test } from "vitest";
import type { Change, StepEvent } from "../core/index.ts";
import { boot, runToHalt, snapshot } from "./programs.ts";

const INPUT_PROGRAM = ["ORG 10", "SKI", "BUN 10", "INP", "OUT", "HLT", "END"].join("\n");

describe("input", () => {
  test("reports the registers a keystroke changes", () => {
    const machine = boot("HLT\nEND");

    expect(machine.input(0x41)).toEqual([
      { kind: "register", name: "INPR", before: 0, after: 0x41 },
      { kind: "register", name: "FGI", before: 0, after: 1 },
    ]);
    expect(machine.state).toMatchObject({ INPR: 0x41, FGI: 1 });
    expect(machine.input(0x41)).toEqual([]);
  });

  test("masks the character to 8 bits", () => {
    const machine = boot("HLT\nEND");
    machine.input(0x141);
    expect(machine.state.INPR).toBe(0x41);
  });
});

describe("outputReady", () => {
  test("reports nothing while the printer is already ready", () => {
    expect(boot("HLT\nEND").outputReady()).toEqual([]);
  });

  test("reports FGO rising after OUT cleared it", () => {
    const machine = boot(["ORG 10", "OUT", "HLT", "END"].join("\n"));
    runToHalt(machine);

    expect(machine.state.FGO).toBe(0);
    expect(machine.outputReady()).toEqual([{ kind: "register", name: "FGO", before: 0, after: 1 }]);
  });
});

describe("restore", () => {
  test("puts a keystroke back", () => {
    const machine = boot("HLT\nEND");
    const before = snapshot(machine);

    machine.restore(machine.input(0x41));
    expect(snapshot(machine)).toEqual(before);
  });

  test("undoes a keystroke that arrived between cycles, so the cycles still revert", () => {
    const machine = boot(INPUT_PROGRAM);
    const start = snapshot(machine);
    const events: StepEvent[] = [];
    const snapshots = [start];

    // SKI does not skip until a key arrives, so the program loops until then.
    for (let i = 0; i < 8; i++) {
      events.push(machine.step());
      snapshots.push(snapshot(machine));
    }
    const keystroke = machine.input(0x41);
    expect(machine.state.FGI).toBe(1);

    const consumed: StepEvent[] = [];
    while (!consumed.at(-1)?.halted) consumed.push(machine.step());
    expect(machine.state).toMatchObject({ AC: 0x41, OUTR: 0x41, FGI: 0, FGO: 0 });

    for (const event of [...consumed].reverse()) machine.revert(event);
    machine.restore(keystroke);
    for (let i = events.length - 1; i >= 0; i--) {
      machine.revert(events[i] as StepEvent);
      expect(snapshot(machine)).toEqual(snapshots[i]);
    }
  });

  test("rejects changes whose values no longer match, restoring nothing", () => {
    const machine = boot("HLT\nEND");
    const keystroke = machine.input(0x41);
    machine.input(0x42);
    const before = snapshot(machine);

    expect(() => machine.restore(keystroke)).toThrow("cannot restore: INPR is 66, but that change left it at 65");
    expect(snapshot(machine)).toEqual(before);
  });

  test("restores memory as well as registers", () => {
    const machine = boot(["ORG 10", "STA X", "HLT", "X, HEX 1234", "END"].join("\n"));
    const write = runToHalt(machine).flatMap((event) => event.changes.filter((c): c is Change => c.kind === "memory"));

    expect(write).toEqual([{ kind: "memory", address: 0x12, before: 0x1234, after: 0 }]);
    expect(machine.peek(0x12)).toBe(0);

    machine.restore(write);
    expect(machine.peek(0x12)).toBe(0x1234);
  });
});
