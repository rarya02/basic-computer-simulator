import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { assemble, Machine, MEMORY_SIZE } from "../core/index.ts";
import type { MachineState, StepEvent } from "../core/index.ts";

export const programsDir = join(import.meta.dirname, "..", "programs");
export const goldenDir = join(import.meta.dirname, "golden");

export const programNames = readdirSync(programsDir)
  .filter((file) => file.endsWith(".asm"))
  .map((file) => file.slice(0, -".asm".length))
  .sort();

export const readProgram = (name: string) => readFileSync(join(programsDir, `${name}.asm`), "utf8");

export function boot(source: string, entry?: number): Machine {
  const result = assemble(source);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const machine = new Machine();
  machine.load(entry === undefined ? result : { ...result, entry });
  return machine;
}

export function runToHalt(machine: Machine, limit = 100_000): StepEvent[] {
  const events: StepEvent[] = [];
  while (events.length < limit) {
    const event = machine.step();
    events.push(event);
    if (event.halted) return events;
  }
  throw new Error("machine did not halt");
}

export const memoryImage = (machine: Machine) => Array.from({ length: MEMORY_SIZE }, (_, address) => machine.peek(address));

export interface Snapshot {
  readonly cycles: number;
  readonly state: MachineState;
  readonly memory: string;
}

export const snapshot = (machine: Machine): Snapshot => ({
  cycles: machine.cycles,
  state: machine.state,
  memory: memoryImage(machine).join(","),
});
