import { FLIP_FLOPS, REGISTERS } from "../../../core/index.ts";
import { create, element } from "../dom.ts";
import { hex, REGISTER_DIGITS } from "../format.ts";
import type { UnitName, ViewModel } from "../view-model.ts";

const TITLES: Readonly<Record<UnitName, string>> = {
  AR: "Address register",
  PC: "Program counter",
  DR: "Data register",
  AC: "Accumulator",
  IR: "Instruction register",
  TR: "Temporary register",
  INPR: "Input register",
  OUTR: "Output register",
  SC: "Sequence counter",
  E: "Extended accumulator bit (carry)",
  I: "Indirect address bit",
  S: "Start-stop flip-flop, 0 when halted",
  R: "Interrupt flip-flop",
  IEN: "Interrupt enable",
  FGI: "Input flag",
  FGO: "Output flag",
};

interface Cell {
  readonly name: UnitName;
  readonly node: HTMLElement;
  readonly value: HTMLElement;
  readonly digits: number | null;
}

export class RegisterPanel {
  readonly #cells: Cell[] = [];

  constructor() {
    const registers = element("registers", HTMLElement);
    const flags = element("flags", HTMLElement);
    for (const name of REGISTERS) registers.append(this.#cell(name, REGISTER_DIGITS[name]));
    for (const name of FLIP_FLOPS) flags.append(this.#cell(name, null));
  }

  render(model: ViewModel): void {
    const changed = model.changedUnits;
    for (const { name, node, value, digits } of this.#cells) {
      const current = model.state[name];
      value.textContent = digits === null ? String(current) : hex(current, digits);
      node.classList.toggle("changed", changed.has(name));
    }
  }

  #cell(name: UnitName, digits: number | null): HTMLElement {
    const node = create("div", "unit-cell");
    node.title = TITLES[name];
    const value = create("span", "value");
    node.append(create("span", "name", name), value);
    this.#cells.push({ name, node, value, digits });
    return node;
  }
}
