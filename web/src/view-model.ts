import { disassemble, FLIP_FLOPS, MEMORY_SIZE, REGISTERS } from "../../core/index.ts";
import type { AssemblyResult, Change, FlipFlopName, MachineState, RegisterName, StepEvent } from "../../core/index.ts";
import type { BreakpointHit, Report, Status } from "./protocol.ts";

export type UnitName = RegisterName | FlipFlopName;

export interface CurrentInstruction {
  readonly line: number;
  /** Not fetched yet: the next clock cycle is its T0. */
  readonly pending: boolean;
}

export interface OutputEntry {
  readonly cycle: number;
  readonly value: number;
}

export interface InterruptRecord {
  readonly cycle: number;
  /** The PC the interrupt cycle put aside, which is where the service routine returns to. */
  readonly returnAddress: number;
  readonly savedAt: number;
  /** Where the diverted fetch continues, one past the saved return address. */
  readonly vector: number;
}

function zeroState(): Record<UnitName, number> {
  const state = {} as Record<UnitName, number>;
  for (const name of [...REGISTERS, ...FLIP_FLOPS]) state[name] = 0;
  return state;
}

/**
 * Everything the panels display, derived only from worker reports: the snapshot
 * taken at load, then the changes carried by each step event and each stimulus,
 * applied forward when stepping and backward when stepping back.
 */
export class ViewModel {
  #source = "";
  #assembly: AssemblyResult | null = null;
  #lines = new Map<number, number>();
  #addresses = new Map<number, number>();
  #state = zeroState();
  #memory = new Uint16Array(MEMORY_SIZE);
  #cycles = 0;
  #instructions = 0;
  readonly #mix = new Map<string, number>();
  readonly #output: OutputEntry[] = [];
  readonly #interrupts: InterruptRecord[] = [];
  #event: StepEvent | null = null;
  #hit: BreakpointHit | null = null;
  #status: Status = { running: false, halted: true, canStepBack: false };
  #error: string | null = null;

  get source(): string {
    return this.#source;
  }

  get assembly(): AssemblyResult | null {
    return this.#assembly;
  }

  get state(): MachineState {
    return this.#state;
  }

  get cycles(): number {
    return this.#cycles;
  }

  get instructions(): number {
    return this.#instructions;
  }

  /** Completed instructions per mnemonic. */
  get mix(): ReadonlyMap<string, number> {
    return this.#mix;
  }

  /** Every OUT the program has executed, oldest first. */
  get output(): readonly OutputEntry[] {
    return this.#output;
  }

  /** The most recent interrupt cycle, or null when none has run. */
  get interrupt(): InterruptRecord | null {
    return this.#interrupts.at(-1) ?? null;
  }

  /** The cycle that produced the current state. */
  get event(): StepEvent | null {
    return this.#event;
  }

  /** The breakpoint that stopped the last run, until the machine moves on. */
  get hit(): BreakpointHit | null {
    return this.#hit;
  }

  get status(): Status {
    return this.#status;
  }

  get error(): string | null {
    return this.#error;
  }

  wordAt(address: number): number {
    return this.#memory[address & 0xfff] ?? 0;
  }

  /** The address a source line assembled to, for breakpoints set from the listing. */
  addressOfLine(line: number): number | undefined {
    return this.#addresses.get(line);
  }

  get changedUnits(): ReadonlySet<UnitName> {
    const names = new Set<UnitName>();
    for (const change of this.#event?.changes ?? []) {
      if (change.kind === "register") names.add(change.name);
    }
    return names;
  }

  get changedAddresses(): ReadonlySet<number> {
    const addresses = new Set<number>();
    for (const change of this.#event?.changes ?? []) {
      if (change.kind === "memory") addresses.add(change.address);
    }
    return addresses;
  }

  get current(): CurrentInstruction | null {
    if (!this.#assembly?.ok) return null;
    const { SC, S, R, PC } = this.#state;

    // R is raised no earlier than T3 and cleared at the end of the interrupt cycle,
    // so R = 1 with SC at 0, 1 or 2 means the interrupt cycle is next or under way.
    if (S === 1 && R === 1 && SC <= 2) return null;
    if (SC === 0) return S === 1 ? this.#lineAt(PC, true) : this.#lineAt(PC - 1, false);
    // No instruction changes PC before its last cycle, so PC addresses the
    // instruction during T0 and points one past it from T1 until it ends.
    return this.#lineAt(SC === 1 ? PC : PC - 1, false);
  }

  apply(report: Report): void {
    switch (report.type) {
      case "loaded":
        this.#source = report.source;
        this.#assembly = report.assembly;
        this.#lines = new Map(report.assembly.words.map((word): [number, number] => [word.address, word.line]));
        this.#addresses = new Map(report.assembly.words.map((word): [number, number] => [word.line, word.address]));
        this.#state = { ...report.state };
        this.#memory = Uint16Array.from(report.memory);
        this.#cycles = 0;
        this.#instructions = 0;
        this.#mix.clear();
        this.#output.length = 0;
        this.#interrupts.length = 0;
        this.#event = null;
        this.#hit = null;
        this.#error = null;
        this.#status = report.status;
        break;
      case "stepped":
        for (const event of report.events) this.#forward(event);
        this.#hit = report.hit;
        this.#status = report.status;
        break;
      case "stimulus":
        for (const change of report.changes) this.#set(change, change.after);
        this.#status = report.status;
        break;
      case "reverted":
        if (report.undone.kind === "cycle") this.#backward(report.undone.event);
        else for (const change of report.undone.changes) this.#set(change, change.before);
        this.#event = report.previous;
        this.#status = report.status;
        break;
      case "status":
        if (report.status.running) this.#hit = null;
        this.#status = report.status;
        break;
      case "error":
        this.#error = report.message;
        break;
    }
  }

  #forward(event: StepEvent): void {
    for (const change of event.changes) this.#set(change, change.after);
    this.#cycles = event.cycle;
    // OUTR keeps its value when the same character is sent twice, so the load says it happened.
    if (event.loads.includes("OUTR")) this.#output.push({ cycle: event.cycle, value: this.#state.OUTR });
    if (event.interrupt && event.memoryWrite) {
      const savedAt = event.memoryWrite.address;
      this.#interrupts.push({
        cycle: event.cycle,
        returnAddress: event.memoryWrite.value,
        savedAt,
        vector: savedAt + 1,
      });
    }
    if (event.endsInstruction) {
      this.#instructions += 1;
      this.#tally(1);
    }
    this.#event = event;
  }

  #backward(event: StepEvent): void {
    // IR only changes at T1, so it holds the finished instruction on either side of its last cycle.
    if (event.endsInstruction) {
      this.#instructions -= 1;
      this.#tally(-1);
    }
    while ((this.#output.at(-1)?.cycle ?? 0) >= event.cycle) this.#output.pop();
    while ((this.#interrupts.at(-1)?.cycle ?? 0) >= event.cycle) this.#interrupts.pop();
    for (const change of event.changes) this.#set(change, change.before);
    this.#cycles = event.cycle - 1;
  }

  #set(change: Change, value: number): void {
    if (change.kind === "register") this.#state[change.name] = value;
    else this.#memory[change.address] = value;
  }

  #tally(delta: number): void {
    const mnemonic = disassemble(this.#state.IR)?.mnemonic ?? "other";
    const count = (this.#mix.get(mnemonic) ?? 0) + delta;
    if (count === 0) this.#mix.delete(mnemonic);
    else this.#mix.set(mnemonic, count);
  }

  #lineAt(address: number, pending: boolean): CurrentInstruction | null {
    const line = this.#lines.get(address & 0xfff);
    return line === undefined ? null : { line, pending };
  }
}
