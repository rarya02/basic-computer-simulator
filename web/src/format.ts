import type { RegisterName } from "../../core/index.ts";

export const hex = (value: number, digits: number) => value.toString(16).toUpperCase().padStart(digits, "0");

export const REGISTER_DIGITS: Readonly<Record<RegisterName, number>> = {
  AR: 3, PC: 3, DR: 4, AC: 4, IR: 4, TR: 4, INPR: 2, OUTR: 2, SC: 1,
};
