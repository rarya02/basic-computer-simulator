import { FLIP_FLOPS, REGISTERS } from "../../core/index.ts";
import type { MachineState } from "../../core/index.ts";

export type Breakpoint =
  | { readonly id: string; readonly enabled: boolean; readonly kind: "address"; readonly address: number }
  | { readonly id: string; readonly enabled: boolean; readonly kind: "condition"; readonly expression: string };

export type Predicate = (state: MachineState) => boolean;

export type Compiled = { readonly ok: true; readonly test: Predicate } | { readonly ok: false; readonly message: string };

type UnitName = keyof MachineState;

const UNITS = new Set<string>([...REGISTERS, ...FLIP_FLOPS]);

const COMPARISONS: Readonly<Record<string, (a: number, b: number) => boolean>> = {
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b,
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
  ">": (a, b) => a > b,
  ">=": (a, b) => a >= b,
};

const COMPARISON = /^([A-Za-z]+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/;

export const MAX_ADDRESS = 0xfff;

/** Addresses are written in hex everywhere in this UI, with or without an 0x prefix. */
export function parseAddress(text: string): number | null {
  const digits = text.trim().replace(/^0[xX]/, "");
  return /^[0-9a-fA-F]{1,3}$/.test(digits) ? parseInt(digits, 16) : null;
}

/** Condition operands follow JavaScript: 0x110 is hex, a bare 272 is decimal. */
export function parseValue(text: string): number | null {
  const trimmed = text.trim();
  const hex = /^0[xX]([0-9a-fA-F]+)$/.exec(trimmed);
  if (hex?.[1] !== undefined) return parseInt(hex[1], 16);
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export function compileCondition(expression: string): Compiled {
  const match = COMPARISON.exec(expression.trim());
  if (!match) return { ok: false, message: "write a comparison such as AC == 0 or PC >= 0x110" };

  const [, leftText = "", operator = "", rightText = ""] = match;
  const left = leftText.toUpperCase();
  if (!UNITS.has(left)) return { ok: false, message: `'${leftText}' is not a register or flip-flop` };

  const compare = COMPARISONS[operator];
  if (!compare) return { ok: false, message: `'${operator}' is not a comparison` };

  const leftUnit = left as UnitName;
  const right = rightText.trim();
  if (UNITS.has(right.toUpperCase())) {
    const rightUnit = right.toUpperCase() as UnitName;
    return { ok: true, test: (state) => compare(state[leftUnit], state[rightUnit]) };
  }

  const value = parseValue(right);
  if (value === null) {
    return { ok: false, message: `'${right}' is not a register, a decimal number, or hex such as 0x110` };
  }
  return { ok: true, test: (state) => compare(state[leftUnit], value) };
}

/**
 * An address breakpoint fires when the machine is about to fetch that address,
 * which is SC back at 0 with no interrupt pending.
 */
export function compile(breakpoint: Breakpoint): Compiled {
  if (breakpoint.kind === "condition") return compileCondition(breakpoint.expression);
  const { address } = breakpoint;
  return { ok: true, test: (state) => state.SC === 0 && state.R === 0 && state.S === 1 && state.PC === address };
}

export const formatAddress = (address: number) => address.toString(16).toUpperCase().padStart(3, "0");

export function describeBreakpoint(breakpoint: Breakpoint): string {
  return breakpoint.kind === "address" ? `Address ${formatAddress(breakpoint.address)}` : breakpoint.expression;
}

export function isBreakpoint(value: unknown): value is Breakpoint {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Breakpoint>;
  if (typeof candidate.id !== "string" || typeof candidate.enabled !== "boolean") return false;
  if (candidate.kind === "address") return typeof candidate.address === "number" && candidate.address >= 0 && candidate.address <= MAX_ADDRESS;
  if (candidate.kind === "condition") return typeof candidate.expression === "string" && compileCondition(candidate.expression).ok;
  return false;
}
