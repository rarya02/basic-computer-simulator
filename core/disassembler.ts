import { MEMORY_REFERENCE, REGISTER_AND_IO } from "./instructions.ts";
import { mask } from "./register.ts";

export interface Disassembly {
  readonly mnemonic: string;
  /** Operand of a memory-reference instruction, otherwise null. */
  readonly address: number | null;
  /** A memory-reference instruction with I = 1. */
  readonly indirect: boolean;
  /** Source text that assembles back to the same word, such as "LDA 113 I". */
  readonly text: string;
}

const MEMORY_REFERENCE_BY_OPCODE = new Map(Array.from(MEMORY_REFERENCE, ([mnemonic, code]) => [code >> 12, mnemonic]));
const REGISTER_AND_IO_BY_CODE = new Map(Array.from(REGISTER_AND_IO, ([mnemonic, code]) => [code, mnemonic]));

/**
 * Decodes a word as a Basic Computer instruction. Opcode 7 words name an
 * instruction only when exactly one defined bit of IR(0-11) is set, so any other
 * opcode 7 pattern returns null. Every other word decodes, including data.
 */
export function disassemble(word: number): Disassembly | null {
  const value = mask(word, 16);
  const mnemonic = MEMORY_REFERENCE_BY_OPCODE.get((value >> 12) & 0b111);

  if (mnemonic !== undefined) {
    const address = value & 0xfff;
    const indirect = value >> 15 === 1;
    const operand = address.toString(16).toUpperCase().padStart(3, "0");
    return { mnemonic, address, indirect, text: `${mnemonic} ${operand}${indirect ? " I" : ""}` };
  }

  const registerOrIO = REGISTER_AND_IO_BY_CODE.get(value);
  return registerOrIO === undefined
    ? null
    : { mnemonic: registerOrIO, address: null, indirect: false, text: registerOrIO };
}
