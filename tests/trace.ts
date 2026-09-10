import { assemble, Machine } from "../core/index.ts";
import type { AssemblyResult, MachineState, StepEvent } from "../core/index.ts";

export const MAX_CYCLES = 100_000;

const hex = (value: number, digits: number) => value.toString(16).toUpperCase().padStart(digits, "0");

/** One trace line, in exactly the format tests/golden/generate.py writes. */
export function formatTraceLine(event: StepEvent, s: MachineState): string {
  const cycle = String(event.cycle).padStart(5, "0");
  const t = `${event.interrupt ? "R" : ""}T${event.t}`;
  return (
    `${cycle} ${t} AR=${hex(s.AR, 3)} PC=${hex(s.PC, 3)} ` +
    `DR=${hex(s.DR, 4)} AC=${hex(s.AC, 4)} IR=${hex(s.IR, 4)} ` +
    `TR=${hex(s.TR, 4)} SC=${hex(s.SC, 1)} ` +
    `E=${s.E} I=${s.I} S=${s.S}`
  );
}

export function traceProgram(source: string): { result: AssemblyResult; lines: string[] } {
  const result = assemble(source);
  const machine = new Machine();
  machine.load(result);

  const lines: string[] = [];
  while (lines.length < MAX_CYCLES) {
    const event = machine.step();
    lines.push(formatTraceLine(event, machine.state));
    if (event.halted) break;
  }
  return { result, lines };
}
