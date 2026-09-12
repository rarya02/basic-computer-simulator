import { expect, test } from "vitest";
import { assemble, disassemble } from "../core/index.ts";

test("decodes the fields of each instruction class", () => {
  expect(disassemble(0xa113)).toEqual({ mnemonic: "LDA", address: 0x113, indirect: true, text: "LDA 113 I" });
  expect(disassemble(0x000f)).toEqual({ mnemonic: "AND", address: 0x00f, indirect: false, text: "AND 00F" });
  expect(disassemble(0x7020)).toEqual({ mnemonic: "INC", address: null, indirect: false, text: "INC" });
  expect(disassemble(0xf800)).toEqual({ mnemonic: "INP", address: null, indirect: false, text: "INP" });
});

test("opcode 7 words without exactly one defined bit name no instruction", () => {
  for (const word of [0x7000, 0x7003, 0x7c00, 0xf000, 0xf020, 0xfff8]) {
    expect(disassemble(word), word.toString(16)).toBeNull();
  }
});

test("every word that names an instruction assembles back to itself", () => {
  const named: { word: number; text: string }[] = [];
  const mnemonics = new Set<string>();
  for (let word = 0; word <= 0xffff; word++) {
    const decoded = disassemble(word);
    if (!decoded) continue;
    named.push({ word, text: decoded.text });
    mnemonics.add(decoded.mnemonic);
  }

  expect(mnemonics.size).toBe(25);
  expect(named).toHaveLength(7 * 2 * 4096 + 18);

  for (let start = 0; start < named.length; start += 4096) {
    const chunk = named.slice(start, start + 4096);
    const result = assemble(["ORG 0", ...chunk.map((entry) => entry.text), "END"].join("\n"));
    expect(result.diagnostics).toEqual([]);
    expect(result.words.map((w) => w.value)).toEqual(chunk.map((entry) => entry.word));
  }
});
