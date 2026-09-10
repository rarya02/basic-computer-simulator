export const REGISTERS = ["AR", "PC", "DR", "AC", "IR", "TR", "INPR", "OUTR", "SC"] as const;
export const FLIP_FLOPS = ["E", "I", "S", "R", "IEN", "FGI", "FGO"] as const;

export type RegisterName = (typeof REGISTERS)[number];
export type FlipFlopName = (typeof FLIP_FLOPS)[number];
export type MachineState = Readonly<Record<RegisterName | FlipFlopName, number>>;

/** Units that can drive the common bus (Mano Fig. 5-4). "M" is the memory unit. */
export type BusSource = "AR" | "PC" | "DR" | "AC" | "IR" | "TR" | "M";

export interface MemoryAccess {
  readonly address: number;
  readonly value: number;
}

export interface StepEvent {
  /** Clock cycles executed since load, including this one. */
  readonly cycle: number;
  readonly t: number;
  /** The cycle was part of the interrupt cycle (R = 1 during T0 to T2). */
  readonly interrupt: boolean;
  readonly microops: readonly string[];
  readonly bus: BusSource | null;
  readonly memoryRead: MemoryAccess | null;
  readonly memoryWrite: MemoryAccess | null;
  /** S = 0 after this step. Stepping a halted machine executes nothing. */
  readonly halted: boolean;
}

export interface Program {
  readonly words: readonly MemoryAccess[];
  readonly entry: number | null;
}
