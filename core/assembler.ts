import { MEMORY_REFERENCE, REGISTER_AND_IO } from "./instructions.ts";
import { mask } from "./register.ts";
import type { Program } from "./types.ts";

export type Severity = "error" | "warning";

export interface Diagnostic {
  readonly severity: Severity;
  /** 1-based source line. */
  readonly line: number;
  /** 1-based column of the offending token. */
  readonly column: number;
  readonly message: string;
}

export interface AssembledWord {
  readonly address: number;
  readonly value: number;
  readonly line: number;
  readonly kind: "instruction" | "data";
}

export interface AssemblyResult extends Program {
  readonly ok: boolean;
  readonly words: readonly AssembledWord[];
  readonly symbols: ReadonlyMap<string, number>;
  readonly diagnostics: readonly Diagnostic[];
}

const KEYWORDS = new Set([...MEMORY_REFERENCE.keys(), ...REGISTER_AND_IO.keys(), "ORG", "END", "DEC", "HEX"]);
const MAX_ADDRESS = 0xfff;
const HEX_DIGITS = /^[0-9A-Fa-f]+$/;

interface Token {
  readonly text: string;
  readonly column: number;
}

interface Statement {
  readonly line: number;
  readonly address: number;
  readonly op: Token;
  readonly operands: readonly Token[];
}

type Report = (line: number, column: number, message: string) => void;

const hex = (value: number) => value.toString(16).toUpperCase();

function tokenize(text: string, offset: number): Token[] {
  return Array.from(text.matchAll(/\S+/g), (m) => ({ text: m[0], column: offset + m.index + 1 }));
}

// Mano comments start with "/". "#" is accepted too, as in the reference assembler.
function stripComment(text: string): string {
  const start = text.search(/[/#]/);
  return start === -1 ? text : text.slice(0, start);
}

function parseHex(text: string, max: number): number | null {
  if (!HEX_DIGITS.test(text)) return null;
  const value = parseInt(text, 16);
  return value <= max ? value : null;
}

function parseDecimal(text: string): number | null {
  if (!/^[+-]?\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= -32768 && value <= 0xffff ? value : null;
}

function parseLine(text: string, line: number, error: Report): { label: Token | null; fields: Token[] } {
  const code = stripComment(text);
  const comma = code.indexOf(",");
  if (comma === -1) return { label: null, fields: tokenize(code, 0) };

  const fields = tokenize(code.slice(comma + 1), comma + 1);
  const second = code.indexOf(",", comma + 1);
  if (second !== -1) error(line, second + 1, "unexpected ','");

  const [label, extra] = tokenize(code.slice(0, comma), 0);
  if (!label) {
    error(line, comma + 1, "expected a label before ','");
    return { label: null, fields };
  }
  if (extra) {
    error(line, label.column, "a label must be a single word directly followed by ','");
    return { label: null, fields };
  }
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(label.text)) {
    error(line, label.column, `invalid label '${label.text}': use a letter followed by letters or digits`);
    return { label: null, fields };
  }
  if (KEYWORDS.has(label.text) || label.text === "I") {
    error(line, label.column, `'${label.text}' is reserved and cannot be a label`);
    return { label: null, fields };
  }
  return { label, fields };
}

function singleOperand(op: Token, operands: readonly Token[], line: number, error: Report): Token | null {
  const [operand, extra] = operands;
  if (!operand) {
    error(line, op.column, `${op.text} needs an operand`);
    return null;
  }
  if (extra) error(line, extra.column, `unexpected '${extra.text}'`);
  return operand;
}

function resolveAddress(token: Token, symbols: ReadonlyMap<string, number>, line: number, error: Report): number | null {
  const value = symbols.get(token.text) ?? (HEX_DIGITS.test(token.text) ? parseInt(token.text, 16) : undefined);
  if (value === undefined) {
    error(line, token.column, `undefined symbol '${token.text}'`);
    return null;
  }
  if (value > MAX_ADDRESS) {
    error(line, token.column, `address ${hex(value)} is outside memory (0 to FFF)`);
    return null;
  }
  return value;
}

function encode(statement: Statement, symbols: ReadonlyMap<string, number>, error: Report): AssembledWord | null {
  const { op, operands, line, address } = statement;
  const word = (value: number, kind: AssembledWord["kind"]): AssembledWord => ({
    address, value: mask(value, 16), line, kind,
  });

  const opcode = MEMORY_REFERENCE.get(op.text);
  if (opcode !== undefined) {
    const [target, mode, extra] = operands;
    if (!target) {
      error(line, op.column, `${op.text} needs an address`);
      return null;
    }
    if (mode && mode.text !== "I") {
      error(line, mode.column, `expected 'I' for indirect addressing, found '${mode.text}'`);
      return null;
    }
    if (extra) {
      error(line, extra.column, `unexpected '${extra.text}'`);
      return null;
    }
    const targetAddress = resolveAddress(target, symbols, line, error);
    if (targetAddress === null) return null;
    return word(opcode | targetAddress | (mode ? 0x8000 : 0), "instruction");
  }

  const code = REGISTER_AND_IO.get(op.text);
  if (code !== undefined) {
    const [extra] = operands;
    if (extra) {
      error(line, extra.column, `${op.text} takes no operand`);
      return null;
    }
    return word(code, "instruction");
  }

  if (op.text === "HEX" || op.text === "DEC") {
    const operand = singleOperand(op, operands, line, error);
    if (!operand) return null;
    const value = op.text === "HEX" ? parseHex(operand.text, 0xffff) : parseDecimal(operand.text);
    if (value === null) {
      const range = op.text === "HEX" ? "a hexadecimal value from 0 to FFFF" : "a decimal value from -32768 to 65535";
      error(line, operand.column, `'${operand.text}' is not ${range}`);
      return null;
    }
    return word(value, "data");
  }

  const hint = KEYWORDS.has(op.text.toUpperCase()) ? " (mnemonics are uppercase)" : "";
  error(line, op.column, `unknown instruction '${op.text}'${hint}`);
  return null;
}

export function assemble(source: string): AssemblyResult {
  const diagnostics: Diagnostic[] = [];
  const error: Report = (line, column, message) => diagnostics.push({ severity: "error", line, column, message });
  const warning: Report = (line, column, message) => diagnostics.push({ severity: "warning", line, column, message });

  const symbols = new Map<string, number>();
  const labelLines = new Map<string, number>();
  const occupied = new Map<number, number>();
  const statements: Statement[] = [];

  // Pass 1: assign an address to every statement and label.
  let lc = 0;
  let ended = false;
  let lastLine = 1;

  for (const [index, text] of source.split(/\r?\n/).entries()) {
    const line = index + 1;

    if (ended) {
      const [content] = tokenize(stripComment(text), 0);
      if (content) {
        warning(line, content.column, "text after END is ignored");
        break;
      }
      continue;
    }

    const { label, fields } = parseLine(text, line, error);
    const [op, ...operands] = fields;
    if (label || op) lastLine = line;

    if (label) {
      if (op?.text === "ORG" || op?.text === "END") {
        error(line, label.column, `a label cannot be attached to ${op.text}`);
      } else if (labelLines.has(label.text)) {
        error(line, label.column, `duplicate label '${label.text}', first defined on line ${labelLines.get(label.text)}`);
      } else {
        symbols.set(label.text, lc);
        labelLines.set(label.text, line);
      }
    }
    if (!op) continue;

    if (op.text === "ORG") {
      const origin = singleOperand(op, operands, line, error);
      if (origin) {
        const value = parseHex(origin.text, MAX_ADDRESS);
        if (value === null) error(line, origin.column, `ORG address '${origin.text}' must be hexadecimal from 0 to FFF`);
        else lc = value;
      }
      continue;
    }

    if (op.text === "END") {
      const [extra] = operands;
      if (extra) error(line, extra.column, "END takes no operand");
      ended = true;
      continue;
    }

    const previous = occupied.get(lc);
    if (lc > MAX_ADDRESS) {
      error(line, op.column, "program runs past the end of memory (FFF)");
    } else if (previous !== undefined) {
      error(line, op.column, `address ${hex(lc)} is already used by line ${previous}`);
    } else {
      occupied.set(lc, line);
      statements.push({ line, address: lc, op, operands });
    }
    lc += 1;
  }

  if (!ended) warning(lastLine, 1, "missing END");

  // Pass 2: encode statements now that every label has an address.
  const words: AssembledWord[] = [];
  for (const statement of statements) {
    const word = encode(statement, symbols, error);
    if (word) words.push(word);
  }

  diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);

  // The reference loader starts execution at the lowest address holding an instruction.
  const instructionAddresses = words.filter((w) => w.kind === "instruction").map((w) => w.address);

  return {
    ok: diagnostics.every((d) => d.severity !== "error"),
    words,
    symbols,
    diagnostics,
    entry: instructionAddresses.length > 0 ? Math.min(...instructionAddresses) : null,
  };
}
