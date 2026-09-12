import { assemble, Machine, MEMORY_SIZE } from "../../core/index.ts";
import type { AssemblyResult, Change, StepEvent } from "../../core/index.ts";
import { compile, describeBreakpoint } from "./breakpoints.ts";
import type { Breakpoint, Predicate } from "./breakpoints.ts";
import { HISTORY_LIMIT } from "./protocol.ts";
import type { BreakpointHit, Command, Report, Rewind, Status } from "./protocol.ts";

export interface SessionOptions {
  readonly post: (report: Report) => void;
  /** Runs a task later, after any commands already waiting, such as a stop. */
  readonly schedule: (task: () => void) => void;
  readonly now: () => number;
  readonly historyLimit?: number;
  /** How long one slice of a run may keep the worker busy, in milliseconds. */
  readonly sliceMs?: number;
}

const LONGEST_INSTRUCTION = 7;
const CYCLES_BETWEEN_CLOCK_CHECKS = 256;

interface Watch {
  readonly id: string;
  readonly test: Predicate;
  /** Whether the condition held at the previous check, so a breakpoint fires on its rising edge. */
  active: boolean;
}

/** The undo log: a stack of cycles and stimuli that forgets its oldest entry when full. */
class History {
  readonly #entries: (Rewind | undefined)[];
  #start = 0;
  #size = 0;

  constructor(capacity: number) {
    this.#entries = new Array<Rewind | undefined>(Math.max(1, capacity));
  }

  get size(): number {
    return this.#size;
  }

  push(entry: Rewind): void {
    const capacity = this.#entries.length;
    this.#entries[(this.#start + this.#size) % capacity] = entry;
    if (this.#size < capacity) this.#size += 1;
    else this.#start = (this.#start + 1) % capacity;
  }

  pop(): Rewind | undefined {
    if (this.#size === 0) return undefined;
    this.#size -= 1;
    const index = (this.#start + this.#size) % this.#entries.length;
    const entry = this.#entries[index];
    this.#entries[index] = undefined;
    return entry;
  }

  /** The newest cycle still in the log, skipping stimuli, which the datapath ignores. */
  lastCycle(): StepEvent | null {
    for (let offset = this.#size - 1; offset >= 0; offset--) {
      const entry = this.#entries[(this.#start + offset) % this.#entries.length];
      if (entry?.kind === "cycle") return entry.event;
    }
    return null;
  }

  clear(): void {
    this.#entries.fill(undefined);
    this.#start = 0;
    this.#size = 0;
  }
}

/** Owns the machine inside the worker and answers every command with reports built from step events. */
export class Session {
  readonly #machine = new Machine();
  readonly #post: (report: Report) => void;
  readonly #schedule: (task: () => void) => void;
  readonly #now: () => number;
  readonly #sliceMs: number;
  readonly #history: History;

  #source = "";
  #assembly: AssemblyResult | null = null;
  #halted = true;
  #running = false;
  #run = 0;
  #watches: Watch[] = [];

  constructor(options: SessionOptions) {
    this.#post = options.post;
    this.#schedule = options.schedule;
    this.#now = options.now;
    this.#sliceMs = options.sliceMs ?? 12;
    this.#history = new History(options.historyLimit ?? HISTORY_LIMIT);
  }

  handle(command: Command): void {
    switch (command.type) {
      case "load":
        this.#source = command.source;
        this.#assembly = assemble(command.source);
        this.#reload();
        break;
      case "reset":
        this.#reload();
        break;
      case "step":
        this.#running = false;
        this.#postSteps(this.#advance(1, () => true));
        break;
      case "stepInstruction":
        this.#running = false;
        this.#postSteps(this.#advance(LONGEST_INSTRUCTION, (e) => e.endsInstruction || (e.interrupt && e.t === 2)));
        break;
      case "run":
        if (!this.#running && !this.#halted) {
          this.#running = true;
          this.#seedWatches();
          const run = ++this.#run;
          this.#schedule(() => this.#slice(run));
        }
        this.#post({ type: "status", status: this.#status() });
        break;
      case "stop":
        this.#running = false;
        this.#post({ type: "status", status: this.#status() });
        break;
      case "back":
        this.#running = false;
        this.#stepBack();
        break;
      case "input":
        this.#deliver(this.#machine.input(command.character));
        break;
      case "outputReady":
        this.#deliver(this.#machine.outputReady());
        break;
      case "breakpoints":
        this.#setBreakpoints(command.breakpoints);
        break;
    }
  }

  #status(): Status {
    return { running: this.#running, halted: this.#halted, canStepBack: this.#history.size > 0 };
  }

  #reload(): void {
    this.#running = false;
    const assembly = this.#assembly;
    if (!assembly) {
      this.#post({ type: "status", status: this.#status() });
      return;
    }

    if (assembly.ok) this.#machine.load(assembly);
    else this.#machine.reset();
    this.#history.clear();

    const state = this.#machine.state;
    this.#halted = state.S === 0;
    const memory = new Uint16Array(MEMORY_SIZE);
    for (let address = 0; address < MEMORY_SIZE; address++) memory[address] = this.#machine.peek(address);

    this.#post({ type: "loaded", source: this.#source, assembly, state, memory, status: this.#status() });
  }

  /** Stimuli arrive between cycles, so they join the undo log alongside them. */
  #deliver(changes: readonly Change[]): void {
    if (changes.length === 0) {
      this.#post({ type: "status", status: this.#status() });
      return;
    }
    this.#history.push({ kind: "stimulus", changes });
    this.#post({ type: "stimulus", changes, status: this.#status() });
  }

  #setBreakpoints(breakpoints: readonly Breakpoint[]): void {
    const watches: Watch[] = [];
    const rejected: string[] = [];

    for (const breakpoint of breakpoints) {
      if (!breakpoint.enabled) continue;
      const compiled = compile(breakpoint);
      if (compiled.ok) watches.push({ id: breakpoint.id, test: compiled.test, active: false });
      else rejected.push(`${describeBreakpoint(breakpoint)}: ${compiled.message}`);
    }

    this.#watches = watches;
    this.#seedWatches();
    if (rejected.length > 0) this.#post({ type: "error", message: `Breakpoint ignored, ${rejected.join("; ")}` });
    this.#post({ type: "status", status: this.#status() });
  }

  /** A run starts from what already holds, so a breakpoint fires on its next rising edge. */
  #seedWatches(): void {
    if (this.#watches.length === 0) return;
    const state = this.#machine.state;
    for (const watch of this.#watches) watch.active = watch.test(state);
  }

  #checkWatches(): BreakpointHit | null {
    if (this.#watches.length === 0) return null;

    const state = this.#machine.state;
    let hit: BreakpointHit | null = null;
    for (const watch of this.#watches) {
      const holds = watch.test(state);
      if (holds && !watch.active && !hit) hit = { id: watch.id, cycle: this.#machine.cycles };
      watch.active = holds;
    }
    return hit;
  }

  #advance(limit: number, isBoundary: (event: StepEvent) => boolean): StepEvent[] {
    const events: StepEvent[] = [];
    while (events.length < limit && !this.#halted) {
      const event = this.#machine.step();
      this.#history.push({ kind: "cycle", event });
      this.#halted = event.halted;
      events.push(event);
      if (isBoundary(event)) break;
    }
    return events;
  }

  #postSteps(events: StepEvent[], hit: BreakpointHit | null = null): void {
    const status = this.#status();
    this.#post(events.length > 0 ? { type: "stepped", events, hit, status } : { type: "status", status });
  }

  #slice(run: number): void {
    if (run !== this.#run || !this.#running) return;

    const deadline = this.#now() + this.#sliceMs;
    const events: StepEvent[] = [];
    let hit: BreakpointHit | null = null;
    do {
      for (let i = 0; i < CYCLES_BETWEEN_CLOCK_CHECKS && !this.#halted && !hit; i++) {
        const event = this.#machine.step();
        this.#history.push({ kind: "cycle", event });
        this.#halted = event.halted;
        events.push(event);
        hit = this.#checkWatches();
      }
    } while (!this.#halted && !hit && this.#now() < deadline);

    if (this.#halted || hit) this.#running = false;
    this.#postSteps(events, hit);
    if (this.#running) this.#schedule(() => this.#slice(run));
  }

  #stepBack(): void {
    const undone = this.#history.pop();
    if (!undone) {
      this.#post({ type: "status", status: this.#status() });
      return;
    }

    if (undone.kind === "cycle") this.#machine.revert(undone.event);
    else this.#machine.restore(undone.changes);
    this.#halted = this.#machine.state.S === 0;
    this.#post({ type: "reverted", undone, previous: this.#history.lastCycle(), status: this.#status() });
  }
}
