export const REGISTERS = ["AR", "PC", "DR", "AC", "IR", "TR", "INPR", "OUTR", "SC"] as const;
export const FLIP_FLOPS = ["E", "I", "S", "R", "IEN", "FGI", "FGO"] as const;

export type RegisterName = (typeof REGISTERS)[number];
export type FlipFlopName = (typeof FLIP_FLOPS)[number];
export type MachineState = Readonly<Record<RegisterName | FlipFlopName, number>>;

/** Units that can drive the common bus (Mano Fig. 5-4). "M" is the memory unit. */
export type BusSource = "AR" | "PC" | "DR" | "AC" | "IR" | "TR" | "M";

/**
 * Units whose load (LD) input is enabled. AC loads from the adder and logic
 * circuit, every other unit loads from the bus, and "M" is a memory write.
 * Increments and clears use the INR and CLR inputs, so they are not loads.
 */
export type LoadTarget = "AR" | "PC" | "DR" | "AC" | "IR" | "TR" | "OUTR" | "M";

export interface MemoryAccess {
  readonly address: number;
  readonly value: number;
}

export type Change =
  | {
      readonly kind: "register";
      readonly name: RegisterName | FlipFlopName;
      readonly before: number;
      readonly after: number;
    }
  | {
      readonly kind: "memory";
      readonly address: number;
      readonly before: number;
      readonly after: number;
    };

export interface StepEvent {
  /** Clock cycles executed since load, including this one. */
  readonly cycle: number;
  readonly t: number;
  /** The cycle was part of the interrupt cycle (R = 1 during T0 to T2). */
  readonly interrupt: boolean;
  readonly microops: readonly string[];
  readonly bus: BusSource | null;
  /** In the order their microoperations appear, each unit at most once. */
  readonly loads: readonly LoadTarget[];
  readonly memoryRead: MemoryAccess | null;
  readonly memoryWrite: MemoryAccess | null;
  /**
   * Every register, flip-flop and memory word whose value differs after this
   * cycle: registers in REGISTERS order, then flip-flops in FLIP_FLOPS order,
   * then memory. A load that writes the value already held is not a change.
   */
  readonly changes: readonly Change[];
  /** This cycle finished an instruction. The interrupt cycle is not an instruction. */
  readonly endsInstruction: boolean;
  /** S = 0 after this step. Stepping a halted machine executes nothing. */
  readonly halted: boolean;
}

export interface Program {
  readonly words: readonly MemoryAccess[];
  readonly entry: number | null;
}
