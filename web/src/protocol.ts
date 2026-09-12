import type { AssemblyResult, Change, MachineState, StepEvent } from "../../core/index.ts";
import type { Breakpoint } from "./breakpoints.ts";

/** Cycles the step back history keeps before forgetting the oldest. */
export const HISTORY_LIMIT = 100_000;

export type Command =
  | { readonly type: "load"; readonly source: string }
  | { readonly type: "reset" }
  | { readonly type: "step" }
  | { readonly type: "stepInstruction" }
  | { readonly type: "run" }
  | { readonly type: "stop" }
  | { readonly type: "back" }
  | { readonly type: "input"; readonly character: number }
  | { readonly type: "outputReady" }
  | { readonly type: "breakpoints"; readonly breakpoints: readonly Breakpoint[] };

export interface Status {
  readonly running: boolean;
  readonly halted: boolean;
  readonly canStepBack: boolean;
}

export interface BreakpointHit {
  readonly id: string;
  readonly cycle: number;
}

/** What a step back undid: one clock cycle, or one stimulus delivered between cycles. */
export type Rewind =
  | { readonly kind: "cycle"; readonly event: StepEvent }
  | { readonly kind: "stimulus"; readonly changes: readonly Change[] };

export type Report =
  | {
      readonly type: "loaded";
      readonly source: string;
      readonly assembly: AssemblyResult;
      readonly state: MachineState;
      readonly memory: Uint16Array;
      readonly status: Status;
    }
  | {
      readonly type: "stepped";
      readonly events: readonly StepEvent[];
      /** The breakpoint that ended a run, if one did. */
      readonly hit: BreakpointHit | null;
      readonly status: Status;
    }
  | { readonly type: "stimulus"; readonly changes: readonly Change[]; readonly status: Status }
  | {
      readonly type: "reverted";
      readonly undone: Rewind;
      /** The cycle before the undone one, or null when history holds no earlier cycle. */
      readonly previous: StepEvent | null;
      readonly status: Status;
    }
  | { readonly type: "status"; readonly status: Status }
  | { readonly type: "error"; readonly message: string };
