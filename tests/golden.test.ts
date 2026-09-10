import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { traceProgram } from "./trace.ts";

const programsDir = join(import.meta.dirname, "..", "programs");
const goldenDir = join(import.meta.dirname, "golden");

const names = (dir: string, extension: string) =>
  readdirSync(dir)
    .filter((file) => file.endsWith(extension))
    .map((file) => file.slice(0, -extension.length))
    .sort();

const programs = names(programsDir, ".asm");

test("every program has exactly one golden trace", () => {
  expect(programs.length).toBeGreaterThan(0);
  expect(names(goldenDir, ".trace")).toEqual(programs);
});

test.each(programs)("%s matches the Python reference trace", (name) => {
  const source = readFileSync(join(programsDir, `${name}.asm`), "utf8");
  const golden = readFileSync(join(goldenDir, `${name}.trace`), "utf8").split(/\r?\n/).filter(Boolean);

  const { result, lines } = traceProgram(source);
  expect(result.diagnostics).toEqual([]);

  const mismatch = golden.findIndex((line, i) => line !== lines[i]);
  const summary =
    mismatch === -1
      ? `trace length ${lines.length}, golden length ${golden.length}`
      : `first mismatch at cycle ${mismatch + 1}\n  python: ${golden[mismatch]}\n  ts:     ${lines[mismatch] ?? "(none)"}`;
  expect(lines, summary).toEqual(golden);
});
