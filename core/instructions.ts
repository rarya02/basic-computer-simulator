/** Memory-reference instructions with I = 0. Indirect addressing sets bit 15. */
export const MEMORY_REFERENCE: ReadonlyMap<string, number> = new Map([
  ["AND", 0x0000], ["ADD", 0x1000], ["LDA", 0x2000], ["STA", 0x3000],
  ["BUN", 0x4000], ["BSA", 0x5000], ["ISZ", 0x6000],
]);

/** Register-reference (0x7xxx) and I/O (0xFxxx) instructions, one bit of IR(0-11) each. */
export const REGISTER_AND_IO: ReadonlyMap<string, number> = new Map([
  ["CLA", 0x7800], ["CLE", 0x7400], ["CMA", 0x7200], ["CME", 0x7100],
  ["CIR", 0x7080], ["CIL", 0x7040], ["INC", 0x7020], ["SPA", 0x7010],
  ["SNA", 0x7008], ["SZA", 0x7004], ["SZE", 0x7002], ["HLT", 0x7001],
  ["INP", 0xf800], ["OUT", 0xf400], ["SKI", 0xf200], ["SKO", 0xf100],
  ["ION", 0xf080], ["IOF", 0xf040],
]);
