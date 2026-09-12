import type { BusSource } from "../../../core/index.ts";
import { create, element } from "../dom.ts";
import { hex, REGISTER_DIGITS } from "../format.ts";
import type { ViewModel } from "../view-model.ts";

// Bus select inputs S2S1S0 for each source (Mano Fig. 5-4). 000 selects nothing.
const SELECT_CODES: Readonly<Record<BusSource, number>> = { AR: 1, PC: 2, DR: 3, AC: 4, IR: 5, TR: 6, M: 7 };
const VALUE_REGISTERS = ["AR", "PC", "DR", "AC", "IR", "TR", "INPR", "OUTR"] as const;
const HIGHLIGHTS = ["driving", "loading", "active", "changed"] as const;

type Highlight = (typeof HIGHLIGHTS)[number];

export class DatapathPanel {
  readonly #values = VALUE_REGISTERS.map((name) => [name, element(`val-${name}`, SVGTextElement)] as const);
  readonly #memoryValue = element("val-M", SVGTextElement);
  readonly #eValue = element("val-E", SVGTextElement);
  readonly #timing = [0, 1, 2, 3, 4, 5, 6].map((t) => element(`t-${t}`, HTMLElement));
  readonly #interrupt = element("t-r", HTMLElement);
  readonly #selectBits = element("select-bits", HTMLElement);
  readonly #selectSource = element("select-source", HTMLElement);
  readonly #cycleLabel = element("microops-label", HTMLElement);
  readonly #microops = element("microops", HTMLOListElement);
  readonly #highlighted = new Set<Element>();

  render(model: ViewModel): void {
    const { event, state } = model;

    for (const node of this.#highlighted) node.classList.remove(...HIGHLIGHTS);
    this.#highlighted.clear();

    for (const [name, text] of this.#values) text.textContent = hex(state[name], REGISTER_DIGITS[name]);
    this.#eValue.textContent = String(state.E);
    this.#memoryValue.textContent = `M[AR] ${hex(model.wordAt(state.AR), 4)}`;

    if (event?.bus) this.#highlight("driving", "bus", `unit-${event.bus}`, `out-${event.bus}`, `sel-${SELECT_CODES[event.bus]}`);
    for (const target of event?.loads ?? []) {
      // AC is loaded from the adder and logic circuit, never directly from the bus.
      if (target === "AC") {
        this.#highlight("loading", "unit-AC", "wire-alu-ac");
        this.#highlight("active", "unit-ALU");
      } else {
        this.#highlight("loading", `unit-${target}`, `in-${target}`);
      }
    }
    if (event?.memoryRead || event?.memoryWrite) this.#highlight("active", "wire-address");
    if (model.changedUnits.has("E")) this.#highlight("changed", "unit-E");

    const bus = event?.bus ?? null;
    this.#selectBits.textContent = (bus === null ? 0 : SELECT_CODES[bus]).toString(2).padStart(3, "0");
    this.#selectSource.textContent =
      bus === null ? "no bus transfer" : bus === "M" ? "memory drives the bus" : `${bus} drives the bus`;

    this.#timing.forEach((cell, t) => cell.classList.toggle("active", event?.t === t));
    this.#interrupt.classList.toggle("active", event?.interrupt === true);

    if (event === null) {
      this.#cycleLabel.textContent = model.cycles === 0 ? "No cycle executed yet" : `Cycle ${model.cycles} is older than the step back history`;
    } else {
      this.#cycleLabel.textContent = `Cycle ${event.cycle}: ${event.interrupt ? "interrupt cycle, " : ""}T${event.t}`;
    }
    const microops = event?.microops ?? [];
    this.#microops.replaceChildren(
      ...(event !== null && microops.length === 0
        ? [create("li", "none", "No microoperation in this cycle")]
        : microops.map((text) => create("li", "", text))),
    );
  }

  #highlight(kind: Highlight, ...ids: string[]): void {
    for (const id of ids) {
      const node = document.getElementById(id);
      if (!node) throw new Error(`the datapath markup has no #${id}`);
      node.classList.add(kind);
      this.#highlighted.add(node);
    }
  }
}
