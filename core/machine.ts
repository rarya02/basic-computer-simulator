import { mask, Register } from "./register.ts";
import type { BusSource, MachineState, MemoryAccess, Program, StepEvent } from "./types.ts";

export const MEMORY_SIZE = 4096;

interface Cycle {
  readonly microops: string[];
  bus: BusSource | null;
  memoryRead: MemoryAccess | null;
  memoryWrite: MemoryAccess | null;
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
    const all = [
      this.#AR, this.#PC, this.#DR, this.#AC, this.#IR, this.#TR, this.#INPR, this.#OUTR, this.#SC,
      this.#E, this.#I, this.#S, this.#R, this.#IEN, this.#FGI, this.#FGO,
    ];
    for (const register of all) register.clear();
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
  input(character: number): void {
    this.#INPR.load(character);
    this.#FGI.load(1);
  }

  /** The printer has consumed OUTR and is ready for more: FGO ← 1. */
  outputReady(): void {
    this.#FGO.load(1);
  }

  step(): StepEvent {
    const t = this.#SC.value;
    const interrupt = t <= 2 && this.#R.value === 1;

    if (this.#S.value === 0) {
      return {
        cycle: this.#cycles, t, interrupt, microops: [], bus: null,
        memoryRead: null, memoryWrite: null, halted: true,
      };
    }

    const c: Cycle = { microops: [], bus: null, memoryRead: null, memoryWrite: null, clearSC: false };

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
      cycle: this.#cycles, t, interrupt, microops: c.microops, bus: c.bus,
      memoryRead: c.memoryRead, memoryWrite: c.memoryWrite, halted: this.#S.value === 0,
    };
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
    this.#memory[address] = word;
    c.memoryWrite = { address, value: word };
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
      c.microops.push("AR ← PC");
    } else if (t === 1) {
      this.#IR.load(this.#readMemory(c));
      this.#PC.increment();
      c.microops.push("IR ← M[AR]", "PC ← PC + 1");
    } else {
      c.bus = "IR";
      this.#AR.load(this.#IR.value);
      this.#I.load(this.#IR.value >> 15);
      c.microops.push("D0, ..., D7 ← Decode IR(12-14)", "AR ← IR(0-11)", "I ← IR(15)");
    }
  }

  #interruptCycle(t: number, c: Cycle): void {
    if (t === 0) {
      c.bus = "PC";
      this.#TR.load(this.#PC.value);
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
        c.microops.push("AR ← M[AR]");
      }
      return;
    }

    switch (opcode) {
      case 0: // AND
        if (t === 4) return this.#loadOperand(c);
        if (t === 5) {
          this.#AC.load(this.#AC.value & this.#DR.value);
          c.microops.push("AC ← AC ∧ DR");
          return this.#endInstruction(c);
        }
        break;
      case 1: // ADD
        if (t === 4) return this.#loadOperand(c);
        if (t === 5) {
          const sum = this.#AC.value + this.#DR.value;
          this.#AC.load(sum);
          this.#E.load(sum >> 16);
          c.microops.push("AC ← AC + DR", "E ← Cout");
          return this.#endInstruction(c);
        }
        break;
      case 2: // LDA
        if (t === 4) return this.#loadOperand(c);
        if (t === 5) {
          this.#AC.load(this.#DR.value);
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
      c.microops.push("AC ← AC′");
    }
    if (bit(8)) {
      this.#E.load(~this.#E.value);
      c.microops.push("E ← E′");
    }
    if (bit(7)) {
      const ac = this.#AC.value;
      this.#AC.load((ac >> 1) | (this.#E.value << 15));
      this.#E.load(ac);
      c.microops.push("AC ← shr AC", "AC(15) ← E", "E ← AC(0)");
    }
    if (bit(6)) {
      const ac = this.#AC.value;
      this.#AC.load((ac << 1) | this.#E.value);
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
      this.#FGI.clear();
      c.microops.push("AC(0-7) ← INPR", "FGI ← 0");
    }
    if (bit(10)) {
      c.bus = "AC";
      this.#OUTR.load(this.#AC.value);
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
