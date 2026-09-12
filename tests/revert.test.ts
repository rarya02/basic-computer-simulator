import { describe, expect, test } from "vitest";
import type { Machine, StepEvent } from "../core/index.ts";
import { boot, programNames, readProgram, snapshot } from "./programs.ts";
import type { Snapshot } from "./programs.ts";

function record(machine: Machine, limit = 100_000): { events: StepEvent[]; snapshots: Snapshot[] } {
  const events: StepEvent[] = [];
  const snapshots = [snapshot(machine)];
  while (events.length < limit) {
    const event = machine.step();
    events.push(event);
    snapshots.push(snapshot(machine));
    if (event.halted) break;
  }
  return { events, snapshots };
}

function revertAll(machine: Machine, events: readonly StepEvent[], snapshots: readonly Snapshot[]): void {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) throw new Error("missing event");
    machine.revert(event);
    expect(snapshot(machine), `after reverting cycle ${event.cycle}`).toEqual(snapshots[i]);
  }
}

const INTERRUPT_PROGRAM = ["ORG 0", "ZRO, HEX 0", "BUN SRV", "ORG 100", "ION", "INC", "HLT", "SRV, HLT", "END"].join("\n");

describe("revert", () => {
  test.each(programNames)("%s: walks back through every earlier state to the loaded machine", (name) => {
    const machine = boot(readProgram(name));
    const { events, snapshots } = record(machine);
    revertAll(machine, events, snapshots);
  });

  test("restores the interrupt cycle, I/O registers and flip-flops", () => {
    const io = boot(["LDA X", "INP", "OUT", "ION", "INC", "HLT", "X, HEX AB00", "END"].join("\n"));
    io.input(0x41);
    const ioRun = record(io);
    expect(ioRun.events.some((e) => e.changes.some((c) => c.kind === "register" && c.name === "OUTR"))).toBe(true);
    revertAll(io, ioRun.events, ioRun.snapshots);

    const interrupt = boot(INTERRUPT_PROGRAM, 0x100);
    const interruptRun = record(interrupt);
    expect(interruptRun.events.some((e) => e.interrupt)).toBe(true);
    revertAll(interrupt, interruptRun.events, interruptRun.snapshots);
  });

  test("stepping again after reverting reproduces the same events", () => {
    const machine = boot(readProgram("multiply"));
    const { events } = record(machine);
    const tail = events.slice(-60);
    for (const event of [...tail].reverse()) machine.revert(event);

    expect(Array.from(tail, () => machine.step())).toEqual(tail);
  });

  test("reverting a step of a halted machine does nothing", () => {
    const machine = boot("HLT\nEND");
    record(machine);
    const before = snapshot(machine);
    const noop = machine.step();

    machine.revert(noop);
    expect(snapshot(machine)).toEqual(before);
  });

  test("rejects an event that is not the latest cycle, restoring nothing", () => {
    const machine = boot(readProgram("multiply"));
    const first = machine.step();
    machine.step();
    const before = snapshot(machine);

    expect(() => machine.revert(first)).toThrow("cannot revert cycle 1: the machine is at cycle 2");
    expect(snapshot(machine)).toEqual(before);
  });

  test("rejects an event whose values do not match the machine, restoring nothing", () => {
    const machine = boot(readProgram("multiply"));
    const event = machine.step();
    const before = snapshot(machine);
    const [first, ...rest] = event.changes;
    if (!first) throw new Error("expected a change");
    const tampered: StepEvent = { ...event, changes: [...rest, { ...first, after: first.after ^ 1 }] };

    expect(() => machine.revert(tampered)).toThrow(/cannot revert cycle 1: \w+ is \d+, but that cycle left it at \d+/);
    expect(snapshot(machine)).toEqual(before);
  });
});
