// The worker session and the page's view model, joined directly without a real
// Worker, checked against a reference Machine stepped alongside them.
import { describe, expect, test } from "vitest";
import { disassemble, MEMORY_SIZE } from "../core/index.ts";
import type { StepEvent } from "../core/index.ts";
import type { Breakpoint } from "../web/src/breakpoints.ts";
import type { Command, Report } from "../web/src/protocol.ts";
import { Session } from "../web/src/session.ts";
import { ViewModel } from "../web/src/view-model.ts";
import { boot, programNames, readProgram, snapshot } from "./programs.ts";
import type { Snapshot } from "./programs.ts";

const INTERRUPT_PROGRAM = [
  "ORG 0",
  "BUN MAIN", // Start here. The interrupt cycle later saves its return address in this word.
  "BUN SRV", // Interrupt vector
  "ORG 100",
  "MAIN, ION",
  "INC",
  "INC",
  "HLT",
  "SRV, HLT",
  "END",
].join("\n");

const LOOP_PROGRAM = "LOP, BUN LOP\nEND";

/** Counts up in AC forever, so a run only ends at a breakpoint or a stop. */
const COUNT_PROGRAM = ["ORG 100", "LOP, INC", "BUN LOP", "END"].join("\n");

/** Waits on SKI until a key arrives, reads it, prints it, and halts. */
const INPUT_PROGRAM = ["ORG 10", "LOP, SKI", "BUN LOP", "INP", "OUT", "HLT", "END"].join("\n");

const atAddress = (id: string, address: number): Breakpoint => ({ id, enabled: true, kind: "address", address });

function harness(historyLimit = 100_000) {
  const model = new ViewModel();
  const reports: Report[] = [];
  const tasks: (() => void)[] = [];
  let clock = 0;
  const session = new Session({
    post: (report) => {
      reports.push(report);
      model.apply(report);
    },
    schedule: (task) => {
      tasks.push(task);
    },
    // Every reading advances the clock past the 1 ms slice, so each slice runs one batch of cycles.
    now: () => clock++,
    sliceMs: 1,
    historyLimit,
  });

  return {
    model,
    reports,
    send: (command: Command) => session.handle(command),
    /** Runs the tasks queued so far and returns how many there were. */
    flush: () => {
      const pending = tasks.splice(0);
      for (const task of pending) task();
      return pending.length;
    },
    last: () => reports.at(-1),
    stepped: () => reports.filter((report) => report.type === "stepped").length,
  };
}

const modelSnapshot = (model: ViewModel): Snapshot => ({
  cycles: model.cycles,
  state: { ...model.state },
  memory: Array.from({ length: MEMORY_SIZE }, (_, address) => model.wordAt(address)).join(","),
});

describe("session and view model", () => {
  test.each(programNames)("%s: the view model follows the machine through every cycle, forward and back", (name) => {
    const source = readProgram(name);
    const h = harness();
    const reference = boot(source);
    const snapshots = [snapshot(reference)];
    const events: StepEvent[] = [];

    h.send({ type: "load", source });
    expect(modelSnapshot(h.model)).toEqual(snapshots[0]);

    while (!h.model.status.halted) {
      h.send({ type: "step" });
      const event = reference.step();
      events.push(event);
      snapshots.push(snapshot(reference));

      expect(h.model.event).toEqual(event);
      expect(modelSnapshot(h.model), `cycle ${event.cycle}`).toEqual(snapshots.at(-1));
      expect([...h.model.changedUnits]).toEqual(event.changes.flatMap((c) => (c.kind === "register" ? [c.name] : [])));
      expect([...h.model.changedAddresses]).toEqual(event.changes.flatMap((c) => (c.kind === "memory" ? [c.address] : [])));
    }
    expect(h.model.instructions).toBe(events.filter((e) => e.endsInstruction).length);

    for (let i = events.length - 1; i >= 0; i--) {
      h.send({ type: "back" });
      expect(h.last()?.type).toBe("reverted");
      expect(modelSnapshot(h.model), `back to cycle ${i}`).toEqual(snapshots[i]);
      expect(h.model.event).toEqual(events[i - 1] ?? null);
    }
    expect(h.model.status.canStepBack).toBe(false);
    expect(h.model.instructions).toBe(0);
    expect(h.model.mix.size).toBe(0);
  });

  test("run posts one slice at a time until the machine halts", () => {
    const source = readProgram("multiply");
    const h = harness();
    h.send({ type: "load", source });
    h.send({ type: "run" });
    h.send({ type: "run" });
    expect(h.model.status.running).toBe(true);

    let slices = 0;
    while (h.flush() > 0) slices += 1;

    const reference = boot(source);
    const events: StepEvent[] = [];
    const mix = new Map<string, number>();
    do {
      const event = reference.step();
      events.push(event);
      if (event.endsInstruction) {
        const mnemonic = disassemble(reference.state.IR)?.mnemonic ?? "other";
        mix.set(mnemonic, (mix.get(mnemonic) ?? 0) + 1);
      }
    } while (!events.at(-1)?.halted);

    expect(slices).toBe(Math.ceil(events.length / 256));
    expect(h.stepped()).toBe(slices);
    expect(h.model.status).toEqual({ running: false, halted: true, canStepBack: true });
    expect(modelSnapshot(h.model)).toEqual(snapshot(reference));
    expect(h.model.instructions).toBe(events.filter((e) => e.endsInstruction).length);
    expect(h.model.mix).toEqual(mix);

    h.send({ type: "back" });
    expect(h.model.cycles).toBe(events.length - 1);
    expect(h.model.event).toEqual(events.at(-2));
    expect(h.model.status).toEqual({ running: false, halted: false, canStepBack: true });
  });

  test("stop ends a run between slices, and slices left by an earlier run do nothing", () => {
    const h = harness();
    h.send({ type: "load", source: LOOP_PROGRAM });

    h.send({ type: "run" });
    expect(h.flush()).toBe(1);
    expect(h.stepped()).toBe(1);
    expect(h.model.cycles).toBe(256);

    h.send({ type: "stop" });
    expect(h.model.status.running).toBe(false);
    expect(h.flush()).toBe(1);
    expect(h.stepped()).toBe(1);

    h.send({ type: "run" });
    h.send({ type: "stop" });
    h.send({ type: "run" });
    expect(h.flush()).toBe(2);
    expect(h.stepped()).toBe(2);
    expect(h.model.cycles).toBe(512);

    h.send({ type: "stop" });
    h.flush();
    h.send({ type: "step" });
    expect(h.model.cycles).toBe(513);
    expect(h.model.status).toEqual({ running: false, halted: false, canStepBack: true });
  });

  test("step instruction stops at each instruction boundary and treats the interrupt cycle as its own step", () => {
    const h = harness();
    h.send({ type: "load", source: INTERRUPT_PROGRAM });
    const lineOf = (address: number) => h.model.assembly?.words.find((w) => w.address === address)?.line;

    const steps: { timing: string; current: unknown }[] = [];
    while (!h.model.status.halted) {
      h.send({ type: "stepInstruction" });
      const report = h.last();
      if (report?.type !== "stepped") throw new Error(`expected a stepped report, got ${report?.type}`);
      steps.push({
        timing: report.events.map((e) => `${e.interrupt ? "R" : ""}T${e.t}`).join(" "),
        current: h.model.current,
      });
    }

    expect(steps).toEqual([
      { timing: "T0 T1 T2 T3 T4", current: { line: lineOf(0x100), pending: true } }, // BUN MAIN
      { timing: "T0 T1 T2 T3", current: { line: lineOf(0x101), pending: true } }, // ION
      { timing: "T0 T1 T2 T3", current: null }, // INC raises R, so the interrupt cycle is next
      { timing: "RT0 RT1 RT2", current: { line: lineOf(0x001), pending: true } },
      { timing: "T0 T1 T2 T3 T4", current: { line: lineOf(0x104), pending: true } }, // BUN SRV
      { timing: "T0 T1 T2 T3", current: { line: lineOf(0x104), pending: false } }, // HLT
    ]);
  });

  test("the current line is the next instruction between instructions and the executing one during it", () => {
    const h = harness();
    h.send({ type: "load", source: readProgram("multiply") });
    const lineOf = (address: number) => h.model.assembly?.words.find((w) => w.address === address)?.line;
    const stepAndLocate = () => {
      h.send({ type: "step" });
      return h.model.current;
    };

    expect(h.model.current).toEqual({ line: lineOf(0x100), pending: true });
    expect([stepAndLocate(), stepAndLocate(), stepAndLocate()]).toEqual(Array(3).fill({ line: lineOf(0x100), pending: false }));
    expect(stepAndLocate()).toEqual({ line: lineOf(0x101), pending: true });
    expect(Array.from({ length: 5 }, stepAndLocate)).toEqual(Array(5).fill({ line: lineOf(0x101), pending: false }));
    expect(stepAndLocate()).toEqual({ line: lineOf(0x102), pending: true });

    h.send({ type: "run" });
    while (h.flush() > 0);
    expect(h.model.current).toEqual({ line: lineOf(0x110), pending: false });
  });

  test("the current line is empty during the interrupt cycle", () => {
    const h = harness();
    h.send({ type: "load", source: INTERRUPT_PROGRAM });
    for (let i = 0; i < 3; i++) h.send({ type: "stepInstruction" });

    const during = [h.model.current];
    for (let i = 0; i < 2; i++) {
      h.send({ type: "step" });
      during.push(h.model.current);
    }
    expect(during).toEqual([null, null, null]);
  });

  test("step back reaches no further than the history limit", () => {
    const source = readProgram("multiply");
    const h = harness(10);
    h.send({ type: "load", source });
    for (let i = 0; i < 25; i++) h.send({ type: "step" });

    const answers = Array.from({ length: 12 }, () => {
      h.send({ type: "back" });
      return h.last()?.type;
    });

    const reference = boot(source);
    for (let i = 0; i < 15; i++) reference.step();
    expect(answers).toEqual([...Array<string>(10).fill("reverted"), "status", "status"]);
    expect(modelSnapshot(h.model)).toEqual(snapshot(reference));
    expect(h.model.event).toBeNull();
    expect(h.model.status.canStepBack).toBe(false);
  });

  test("a halted machine answers step, step instruction and run with status only", () => {
    const h = harness();
    h.send({ type: "load", source: "HLT\nEND" });
    h.send({ type: "stepInstruction" });
    expect(h.model.status.halted).toBe(true);

    const before = h.reports.length;
    for (const type of ["step", "stepInstruction", "run"] as const) h.send({ type });
    expect(h.reports.slice(before).map((r) => r.type)).toEqual(["status", "status", "status"]);
    expect(h.flush()).toBe(0);
    expect(h.model.cycles).toBe(4);
  });

  test("reset reloads the program and clears the history, counts and instruction mix", () => {
    const source = readProgram("sum_loop");
    const h = harness();
    h.send({ type: "load", source });
    h.send({ type: "run" });
    while (h.flush() > 0);
    expect(h.model.instructions).toBeGreaterThan(0);

    h.send({ type: "reset" });
    expect(modelSnapshot(h.model)).toEqual(snapshot(boot(source)));
    expect([h.model.instructions, h.model.mix.size, h.model.event]).toEqual([0, 0, null]);
    expect(h.model.status).toEqual({ running: false, halted: false, canStepBack: false });
  });

  test("assembly errors are reported and leave the machine halted", () => {
    const h = harness();
    h.send({ type: "load", source: "        FOO\n        END" });

    expect(h.model.assembly?.ok).toBe(false);
    expect(h.model.assembly?.diagnostics.map((d) => `${d.line}:${d.column} ${d.message}`)).toEqual([
      "1:9 unknown instruction 'FOO'",
    ]);
    expect(h.model.status.halted).toBe(true);
    expect(h.model.current).toBeNull();

    h.send({ type: "step" });
    expect(h.last()?.type).toBe("status");
  });
});

describe("breakpoints", () => {
  test("a run stops where the machine reaches the address, naming the breakpoint that fired", () => {
    const h = harness();
    h.send({ type: "load", source: COUNT_PROGRAM });
    h.send({ type: "breakpoints", breakpoints: [atAddress("bp-1", 0x101)] });

    h.send({ type: "run" });
    while (h.flush() > 0);

    // INC takes four cycles, and the break lands with SC back at 0, before the fetch.
    expect(h.model.hit).toEqual({ id: "bp-1", cycle: 4 });
    expect(h.model.status).toEqual({ running: false, halted: false, canStepBack: true });
    expect(h.model.state).toMatchObject({ PC: 0x101, SC: 0, AC: 1 });

    h.send({ type: "run" });
    while (h.flush() > 0);
    // Running again leaves the breakpoint behind and stops next time round the loop.
    expect(h.model.hit).toEqual({ id: "bp-1", cycle: 13 });
    expect(h.model.state.AC).toBe(2);
  });

  test("a disabled breakpoint does not stop a run", () => {
    const h = harness();
    h.send({ type: "load", source: COUNT_PROGRAM });
    h.send({ type: "breakpoints", breakpoints: [{ ...atAddress("bp-1", 0x101), enabled: false }] });

    h.send({ type: "run" });
    for (let i = 0; i < 3; i++) h.flush();

    expect(h.model.hit).toBeNull();
    expect(h.model.status.running).toBe(true);
    h.send({ type: "stop" });
  });

  test("a condition stops the run when it turns true, and not again while it stays true", () => {
    const h = harness();
    h.send({ type: "load", source: COUNT_PROGRAM });
    h.send({ type: "breakpoints", breakpoints: [{ id: "bp-2", enabled: true, kind: "condition", expression: "AC >= 5" }] });

    h.send({ type: "run" });
    while (h.flush() > 0);
    expect(h.model.hit?.id).toBe("bp-2");
    expect(h.model.state.AC).toBe(5);

    h.send({ type: "run" });
    for (let i = 0; i < 3; i++) h.flush();
    expect(h.model.hit).toBeNull();
    expect(h.model.status.running).toBe(true);
    expect(h.model.state.AC).toBeGreaterThan(5);
    h.send({ type: "stop" });
  });

  test("an expression that does not compile is reported, and the others still work", () => {
    const h = harness();
    h.send({ type: "load", source: COUNT_PROGRAM });
    h.send({
      type: "breakpoints",
      breakpoints: [{ id: "bad", enabled: true, kind: "condition", expression: "AC = 0" }, atAddress("bp-1", 0x101)],
    });

    expect(h.model.error).toContain("AC = 0");
    h.send({ type: "run" });
    while (h.flush() > 0);
    expect(h.model.hit?.id).toBe("bp-1");
  });
});

describe("input and output", () => {
  test("a keystroke sets INPR and FGI, and a waiting program reads and prints it", () => {
    const h = harness();
    h.send({ type: "load", source: INPUT_PROGRAM });

    h.send({ type: "run" });
    h.flush();
    expect(h.model.state.FGI).toBe(0);
    expect(h.model.status.running).toBe(true);

    h.send({ type: "input", character: 0x41 });
    expect(h.last()?.type).toBe("stimulus");
    expect(h.model.state).toMatchObject({ INPR: 0x41, FGI: 1 });

    while (h.flush() > 0);
    expect(h.model.status.halted).toBe(true);
    expect(h.model.state).toMatchObject({ AC: 0x41, OUTR: 0x41, FGI: 0, FGO: 0 });
    expect(h.model.output).toEqual([{ cycle: expect.any(Number), value: 0x41 }]);

    h.send({ type: "outputReady" });
    expect(h.model.state.FGO).toBe(1);
  });

  test("a keystroke that changes nothing is not recorded", () => {
    const h = harness();
    h.send({ type: "load", source: INPUT_PROGRAM });

    h.send({ type: "input", character: 0x41 });
    expect(h.last()?.type).toBe("stimulus");
    h.send({ type: "input", character: 0x41 });
    expect(h.last()?.type).toBe("status");

    h.send({ type: "back" });
    expect(h.model.state).toMatchObject({ INPR: 0, FGI: 0 });
    expect(h.model.status.canStepBack).toBe(false);
  });

  test("stepping back undoes the keystroke as well as the cycles around it", () => {
    const h = harness();
    h.send({ type: "load", source: INPUT_PROGRAM });
    const start = modelSnapshot(h.model);

    for (let i = 0; i < 6; i++) h.send({ type: "step" });
    h.send({ type: "input", character: 0x41 });
    while (!h.model.status.halted) h.send({ type: "stepInstruction" });
    expect(h.model.output).toHaveLength(1);

    const undone: string[] = [];
    while (h.model.status.canStepBack) {
      h.send({ type: "back" });
      const report = h.last();
      if (report?.type === "reverted") undone.push(report.undone.kind);
    }

    expect(undone).toContain("stimulus");
    expect(modelSnapshot(h.model)).toEqual(start);
    expect(h.model.output).toEqual([]);
    expect(h.model.event).toBeNull();
  });
});

describe("the interrupt cycle", () => {
  test("is recorded with the return address it stored and where the fetch went", () => {
    const h = harness();
    h.send({ type: "load", source: INTERRUPT_PROGRAM });
    while (!h.model.status.halted) h.send({ type: "stepInstruction" });

    expect(h.model.interrupt).toEqual({ cycle: expect.any(Number), returnAddress: 0x102, savedAt: 0, vector: 1 });
    expect(h.model.wordAt(0)).toBe(0x102);

    while (h.model.interrupt !== null) h.send({ type: "back" });
    // Back inside the interrupt cycle, before the write that saved the return address.
    expect(h.model.state).toMatchObject({ R: 1, SC: 1 });
    expect(h.model.wordAt(0)).not.toBe(0x102);
  });
});
