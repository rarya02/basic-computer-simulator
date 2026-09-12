import { mask, Register } from "./register.ts";
import { FLIP_FLOPS, REGISTERS } from "./types.ts";
import type {
  BusSource, Change, FlipFlopName, LoadTarget, MachineState, MemoryAccess, Program, RegisterName, StepEvent,
} from "./types.ts";

export const MEMORY_SIZE = 4096;

const UNITS = [...REGISTERS, ...FLIP_FLOPS];

interface Cycle {
  readonly microops: string[];
  readonly loads: LoadTarget[];
  bus: BusSource | null;
  memoryRead: MemoryAccess | null;
  memoryWrite: MemoryAccess | null;
  overwritten: number;
  clearSC: boolean;
}

export class Machine {
  readonly #memory = new Uint16Array(MEMORY_SIZE);

  readonly #AR = new Register(12);
  readonly #PC = new Register(12);
  readonly #DR = new Register(16);
  readonly #AC = new Register(16);
  readonly #IR = new Register(16);
  readonly #TR = new Register(16);
  readonly #INPR = new Register(8);
  readonly #OUTR = new Register(8);
  readonly #SC = new Register(4);

  readonly #E = new Register(1);
  readonly #I = new Register(1);
  readonly #S = new Register(1);
  readonly #R = new Register(1);
  readonly #IEN = new Register(1);
  readonly #FGI = new Register(1);
  readonly #FGO = new Register(1);

  readonly #units: Readonly<Record<RegisterName | FlipFlopName, Register>> = {
    AR: this.#AR, PC: this.#PC, DR: this.#DR, AC: this.#AC, IR: this.#IR, TR: this.#TR,
    INPR: this.#INPR, OUTR: this.#OUTR, SC: this.#SC,
    E: this.#E, I: this.#I, S: this.#S, R: this.#R, IEN: this.#IEN, FGI: this.#FGI, FGO: this.#FGO,
  };

  #cycles = 0;

  constructor() {
    this.reset();
  }

  get cycles(): number {
    return this.#cycles;
  }

  get state(): MachineState {
    return {
      AR: this.#AR.value,
      PC: this.#PC.value,
      DR: this.#DR.value,
      AC: this.#AC.value,
      IR: this.#IR.value,
      TR: this.#TR.value,
      INPR: this.#INPR.value,
      OUTR: this.#OUTR.value,
      SC: this.#SC.value,
      E: this.#E.value,
      I: this.#I.value,
      S: this.#S.value,
      R: this.#R.value,
      IEN: this.#IEN.value,
      FGI: this.#FGI.value,
      FGO: this.#FGO.value,
    };
  }

  peek(address: number): number {
    return this.#memory[mask(address, 12)] ?? 0;
  }

  reset(): void {
    this.#memory.fill(0);
    for (const register of Object.values(this.#units)) register.clear();
    // Mano 5-7: the output device starts out ready, so FGO is initially 1.
    this.#FGO.load(1);
    this.#cycles = 0;
  }

  load(program: Program): void {
    this.reset();
    for (const { address, value } of program.words) {
      this.#memory[mask(address, 12)] = mask(value, 16);
    }
    this.#PC.load(program.entry ?? 0);
    this.#S.load(1);
  }

  /** The keyboard delivers a character: INPR ← character, FGI ← 1. */
  input(character: number): readonly Change[] {
    return this.#stimulus(() => {
      this.#INPR.load(character);
      this.#FGI.load(1);
    });
  }

  /** The printer has consumed OUTR and is ready for more: FGO ← 1. */
  outputReady(): readonly Change[] {
    return this.#stimulus(() => this.#FGO.load(1));
  }

  /**
   * Puts back the values these changes replaced. Stimuli happen between cycles,
   * so undoing one goes through here; undoing a cycle goes through revert().
   */
  restore(changes: readonly Change[]): void {
    this.#checkUnchanged(changes, "restore", "that change");
    this.#putBack(changes);
  }

  step(): StepEvent {
    const t = this.#SC.value;
    const interrupt = t <= 2 && this.#R.value === 1;

    if (this.#S.value === 0) {
      return {
        cycle: this.#cycles, t, interrupt, microops: [], bus: null, loads: [],
        memoryRead: null, memoryWrite: null, changes: [], endsInstruction: false, halted: true,
      };
    }

    const before = this.state;
    const c: Cycle = {
      microops: [], loads: [], bus: null, memoryRead: null, memoryWrite: null, overwritten: 0, clearSC: false,
    };

    // T0'T1'T2'(IEN)(FGI + FGO): R ← 1. Like every control function it is sampled
    // before the clock edge, so an ION in this same cycle does not count yet.
    const raiseInterrupt =
      t > 2 && this.#IEN.value === 1 && (this.#FGI.value === 1 || this.#FGO.value === 1);

    if (interrupt) this.#interruptCycle(t, c);
    else if (t <= 2) this.#fetchAndDecode(t, c);
    else this.#execute(t, c);

    if (raiseInterrupt) {
      this.#R.load(1);
      c.microops.push("R ← 1");
    }
    if (c.clearSC) this.#SC.clear();
    else this.#SC.increment();
    this.#cycles += 1;

    return {
      cycle: this.#cycles, t, interrupt, microops: c.microops, bus: c.bus, loads: c.loads,
      memoryRead: c.memoryRead, memoryWrite: c.memoryWrite, changes: this.#changesSince(before, c),
      endsInstruction: c.clearSC && !interrupt, halted: this.#S.value === 0,
    };
  }

  /**
   * Undoes the latest cycle, given the event step() returned for it. Events must
   * be reverted newest first. An event that does not describe the latest cycle
   * throws before anything is restored.
   */
  revert(event: StepEvent): void {
    if (event.cycle !== this.#cycles) {
      throw new Error(`cannot revert cycle ${event.cycle}: the machine is at cycle ${this.#cycles}`);
    }
    // Every executed cycle changes SC, so an event without changes came from
    // stepping a halted machine and executed nothing.
    if (event.changes.length === 0) return;

    this.#checkUnchanged(event.changes, `revert cycle ${event.cycle}`, "that cycle");
    this.#putBack(event.changes);
    this.#cycles -= 1;
  }

  #checkUnchanged(changes: readonly Change[], action: string, source: string): void {
    for (const change of changes) {
      const current = change.kind === "register" ? this.#units[change.name].value : this.peek(change.address);
      if (current !== change.after) {
        const unit = change.kind === "register" ? change.name : `M[${change.address.toString(16).toUpperCase()}]`;
        throw new Error(`cannot ${action}: ${unit} is ${current}, but ${source} left it at ${change.after}`);
      }
    }
  }

  #putBack(changes: readonly Change[]): void {
    for (const change of changes) {
      if (change.kind === "register") this.#units[change.name].load(change.before);
      else this.#memory[mask(change.address, 12)] = mask(change.before, 16);
    }
  }

  #stimulus(apply: () => void): Change[] {
    const before = this.state;
    apply();
    return this.#registerChanges(before);
  }

  #registerChanges(before: MachineState): Change[] {
    const changes: Change[] = [];
    for (const name of UNITS) {
      const after = this.#units[name].value;
      if (after !== before[name]) changes.push({ kind: "register", name, before: before[name], after });
    }
    return changes;
  }

  #changesSince(before: MachineState, c: Cycle): Change[] {
    const changes = this.#registerChanges(before);
    if (c.memoryWrite && c.memoryWrite.value !== c.overwritten) {
      const { address, value } = c.memoryWrite;
      changes.push({ kind: "memory", address, before: c.overwritten, after: value });
    }
    return changes;
  }

  #loaded(c: Cycle, target: LoadTarget): void {
    if (!c.loads.includes(target)) c.loads.push(target);
  }

  #readMemory(c: Cycle): number {
    const address = this.#AR.value;
    const value = this.#memory[address] ?? 0;
    c.bus = "M";
    c.memoryRead = { address, value };
    return value;
  }

  #writeMemory(c: Cycle, value: number): void {
    const address = this.#AR.value;
    const word = mask(value, 16);
    c.overwritten = this.#memory[address] ?? 0;
    this.#memory[address] = word;
    c.memoryWrite = { address, value: word };
    this.#loaded(c, "M");
  }

  #endInstruction(c: Cycle): void {
    c.microops.push("SC ← 0");
    c.clearSC = true;
  }

  #skipIf(c: Cycle, condition: boolean, rtl: string): void {
    if (condition) this.#PC.increment();
    c.microops.push(rtl);
  }

  #fetchAndDecode(t: number, c: Cycle): void {
    if (t === 0) {
      c.bus = "PC";
      this.#AR.load(this.#PC.value);
      this.#loaded(c, "AR");
      c.microops.push("AR ← PC");
    } else if (t === 1) {
      this.#IR.load(this.#readMemory(c));
      this.#loaded(c, "IR");
      this.#PC.increment();
      c.microops.push("IR ← M[AR]", "PC ← PC + 1");
    } else {
      c.bus = "IR";
      this.#AR.load(this.#IR.value);
      this.#loaded(c, "AR");
      this.#I.load(this.#IR.value >> 15);
      c.microops.push("D0, ..., D7 ← Decode IR(12-14)", "AR ← IR(0-11)", "I ← IR(15)");
    }
  }

  #interruptCycle(t: number, c: Cycle): void {
    if (t === 0) {
      c.bus = "PC";
      this.#TR.load(this.#PC.value);
      this.#loaded(c, "TR");
      this.#AR.clear();
      c.microops.push("AR ← 0", "TR ← PC");
    } else if (t === 1) {
      c.bus = "TR";
      this.#writeMemory(c, this.#TR.value);
      this.#PC.clear();
      c.microops.push("M[AR] ← TR", "PC ← 0");
    } else {
      this.#PC.increment();
      this.#IEN.clear();
      this.#R.clear();
      c.microops.push("PC ← PC + 1", "IEN ← 0", "R ← 0");
      this.#endInstruction(c);
    }
  }

  #execute(t: number, c: Cycle): void {
    const opcode = (this.#IR.value >> 12) & 0b111;
    const indirect = this.#I.value === 1;

    if (opcode === 7 && t === 3) {
      if (indirect) this.#inputOutput(c);
      else this.#registerReference(c);
      return;
    }

    if (opcode !== 7 && t === 3) {
      if (indirect) {
        this.#AR.load(this.#readMemory(c));
        this.#loaded(c, "AR");
        c.microops.push("AR ← M[AR]");
      }
      return;
    }

    switch (opcode) {
      case 0: // AND
        if (t === 4) return this.#loadOperand(c);
        if (t === 5) {
          this.#AC.load(this.#AC.value & this.#DR.value);
          this.#loaded(c, "AC");
          c.microops.push("AC ← AC ∧ DR");
          return this.#endInstruction(c);
        }
        break;
      case 1: // ADD
        if (t === 4) return this.#loadOperand(c);
        if (t === 5) {
          const sum = this.#AC.value + this.#DR.value;
          this.#AC.load(sum);
          this.#loaded(c, "AC");
          this.#E.load(sum >> 16);
          c.microops.push("AC ← AC + DR", "E ← Cout");
          return this.#endInstruction(c);
        }
        break;
      case 2: // LDA
        if (t === 4) return this.#loadOperand(c);
        if (t === 5) {
          this.#AC.load(this.#DR.value);
          this.#loaded(c, "AC");
          c.microops.push("AC ← DR");
          return this.#endInstruction(c);
        }
        break;
      case 3: // STA
        if (t === 4) {
          c.bus = "AC";
          this.#writeMemory(c, this.#AC.value);
          c.microops.push("M[AR] ← AC");
          return this.#endInstruction(c);
        }
        break;
      case 4: // BUN
        if (t === 4) {
          c.bus = "AR";
          this.#PC.load(this.#AR.value);
          this.#loaded(c, "PC");
          c.microops.push("PC ← AR");
          return this.#endInstruction(c);
        }
        break;
      case 5: // BSA
        if (t === 4) {
          c.bus = "PC";
          this.#writeMemory(c, this.#PC.value);
          this.#AR.increment();
          c.microops.push("M[AR] ← PC", "AR ← AR + 1");
          return;
        }
        if (t === 5) {
          c.bus = "AR";
          this.#PC.load(this.#AR.value);
          this.#loaded(c, "PC");
          c.microops.push("PC ← AR");
          return this.#endInstruction(c);
        }
        break;
      case 6: // ISZ
        if (t === 4) return this.#loadOperand(c);
        if (t === 5) {
          this.#DR.increment();
          c.microops.push("DR ← DR + 1");
          return;
        }
        if (t === 6) {
          c.bus = "DR";
          this.#writeMemory(c, this.#DR.value);
          c.microops.push("M[AR] ← DR");
          this.#skipIf(c, this.#DR.value === 0, "if (DR = 0) then (PC ← PC + 1)");
          return this.#endInstruction(c);
        }
        break;
    }
    throw new Error(`no microoperation defined for D${opcode} at T${t}`);
  }

  #loadOperand(c: Cycle): void {
    this.#DR.load(this.#readMemory(c));
    this.#loaded(c, "DR");
    c.microops.push("DR ← M[AR]");
  }

  // Mano defines each register-reference and I/O code with exactly one bit of
  // IR(0-11) set. When a word sets several bits, the selected operations run in
  // turn from B11 down to B0, the same order the Python reference uses.
  #registerReference(c: Cycle): void {
    const bit = (n: number) => ((this.#IR.value >> n) & 1) === 1;

    if (bit(11)) {
      this.#AC.clear();
      c.microops.push("AC ← 0");
    }
    if (bit(10)) {
      this.#E.clear();
      c.microops.push("E ← 0");
    }
    if (bit(9)) {
      this.#AC.load(~this.#AC.value);
      this.#loaded(c, "AC");
      c.microops.push("AC ← AC′");
    }
    if (bit(8)) {
      this.#E.load(~this.#E.value);
      c.microops.push("E ← E′");
    }
    if (bit(7)) {
      const ac = this.#AC.value;
      this.#AC.load((ac >> 1) | (this.#E.value << 15));
      this.#loaded(c, "AC");
      this.#E.load(ac);
      c.microops.push("AC ← shr AC", "AC(15) ← E", "E ← AC(0)");
    }
    if (bit(6)) {
      const ac = this.#AC.value;
      this.#AC.load((ac << 1) | this.#E.value);
      this.#loaded(c, "AC");
      this.#E.load(ac >> 15);
      c.microops.push("AC ← shl AC", "AC(0) ← E", "E ← AC(15)");
    }
    if (bit(5)) {
      this.#AC.increment();
      c.microops.push("AC ← AC + 1");
    }
    if (bit(4)) this.#skipIf(c, this.#AC.value >> 15 === 0, "if (AC(15) = 0) then (PC ← PC + 1)");
    if (bit(3)) this.#skipIf(c, this.#AC.value >> 15 === 1, "if (AC(15) = 1) then (PC ← PC + 1)");
    if (bit(2)) this.#skipIf(c, this.#AC.value === 0, "if (AC = 0) then (PC ← PC + 1)");
    if (bit(1)) this.#skipIf(c, this.#E.value === 0, "if (E = 0) then (PC ← PC + 1)");
    if (bit(0)) {
      this.#S.clear();
      c.microops.push("S ← 0");
    }
    this.#endInstruction(c);
  }

  #inputOutput(c: Cycle): void {
    const bit = (n: number) => ((this.#IR.value >> n) & 1) === 1;

    if (bit(11)) {
      // The RTL transfers into AC(0-7) only, so AC(8-15) keeps its value.
      this.#AC.load((this.#AC.value & 0xff00) | this.#INPR.value);
      this.#loaded(c, "AC");
      this.#FGI.clear();
      c.microops.push("AC(0-7) ← INPR", "FGI ← 0");
    }
    if (bit(10)) {
      c.bus = "AC";
      this.#OUTR.load(this.#AC.value);
      this.#loaded(c, "OUTR");
      this.#FGO.clear();
      c.microops.push("OUTR ← AC(0-7)", "FGO ← 0");
    }
    if (bit(9)) this.#skipIf(c, this.#FGI.value === 1, "if (FGI = 1) then (PC ← PC + 1)");
    if (bit(8)) this.#skipIf(c, this.#FGO.value === 1, "if (FGO = 1) then (PC ← PC + 1)");
    if (bit(7)) {
      this.#IEN.load(1);
      c.microops.push("IEN ← 1");
    }
    if (bit(6)) {
      this.#IEN.clear();
      c.microops.push("IEN ← 0");
    }
    this.#endInstruction(c);
  }
}
