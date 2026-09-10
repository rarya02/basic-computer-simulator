import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assemble } from "../core/index.ts";

const repo = join(import.meta.dirname, "..");

test("encodes the multiply program exactly as the reference assembler did", () => {
  // reference/data holds the reference assembler's output for the same program.
  const referenceWords = ["program.txt", "data.txt"]
    .flatMap((file) => readFileSync(join(repo, "reference", "data", file), "utf8").split(/\r?\n/))
    .filter(Boolean)
    .map((line) => line.split(/\s+/).slice(0, 2).map((field) => parseInt(field, 16)));

  const result = assemble(readFileSync(join(repo, "programs", "multiply.asm"), "utf8"));

  expect(result.diagnostics).toEqual([]);
  expect(result.words.map((w) => [w.address, w.value])).toEqual(referenceWords);
  expect(result.entry).toBe(0x100);
  expect(Object.fromEntries(result.symbols)).toEqual({
    LOP: 0x100, ONE: 0x107, ZRO: 0x10b, CTR: 0x111, X: 0x112, Y: 0x113, P: 0x114,
  });
});

test("reports diagnostics with line and column", () => {
  const source = [
    "        ORG 100",
    "        LDA NOPE",
    "X,      HEX O",
    "X,      DEC 70000",
    "        FOO",
    "        cla",
    "        ADD X Y",
    "        CLA X",
    "        STA",
    "        BUN 1000",
    "        ORG 100",
    "        HLT",
    "        END",
    "        CLA",
  ].join("\n");

  const result = assemble(source);

  expect(result.ok).toBe(false);
  expect(result.diagnostics.map((d) => `${d.severity} ${d.line}:${d.column} ${d.message}`)).toEqual([
    "error 2:13 undefined symbol 'NOPE'",
    "error 3:13 'O' is not a hexadecimal value from 0 to FFFF",
    "error 4:1 duplicate label 'X', first defined on line 3",
    "error 4:13 '70000' is not a decimal value from -32768 to 65535",
    "error 5:9 unknown instruction 'FOO'",
    "error 6:9 unknown instruction 'cla' (mnemonics are uppercase)",
    "error 7:15 expected 'I' for indirect addressing, found 'Y'",
    "error 8:13 CLA takes no operand",
    "error 9:9 STA needs an address",
    "error 10:13 address 1000 is outside memory (0 to FFF)",
    "error 12:9 address 100 is already used by line 2",
    "warning 14:9 text after END is ignored",
  ]);
});

test("a missing END is a warning, not an error", () => {
  const result = assemble("CLA\nHLT\n");
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toEqual([{ severity: "warning", line: 2, column: 1, message: "missing END" }]);
});
