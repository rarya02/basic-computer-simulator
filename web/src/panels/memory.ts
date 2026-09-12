import { disassemble, MEMORY_SIZE } from "../../../core/index.ts";
import type { AssemblyResult } from "../../../core/index.ts";
import type { BreakpointStore } from "../breakpoint-store.ts";
import { create, element } from "../dom.ts";
import { hex } from "../format.ts";
import type { ViewModel } from "../view-model.ts";

const ROW_HEIGHT = 20;

interface Row {
  readonly node: HTMLElement;
  readonly address: HTMLElement;
  readonly word: HTMLElement;
  readonly instruction: HTMLElement;
}

/** Draws only the rows in view, since there are 4096 of them. */
export class MemoryPanel {
  readonly #store: BreakpointStore;
  readonly #scroll = element("memory-scroll", HTMLElement);
  readonly #rows = element("memory-rows", HTMLElement);
  readonly #pool: Row[] = [];
  #model: ViewModel | null = null;
  #followedPC = -1;
  #followedAssembly: AssemblyResult | null = null;

  constructor(store: BreakpointStore) {
    this.#store = store;
    element("memory-spacer", HTMLElement).style.height = `${MEMORY_SIZE * ROW_HEIGHT}px`;
    this.#scroll.style.setProperty("--row-height", `${ROW_HEIGHT}px`);
    this.#scroll.addEventListener("scroll", () => this.#draw(), { passive: true });
    this.#rows.addEventListener("click", (event) => this.#toggleBreakpoint(event));
    new ResizeObserver(() => this.#draw()).observe(this.#scroll);
  }

  render(model: ViewModel): void {
    this.#model = model;
    const pc = model.state.PC;
    if (pc !== this.#followedPC || model.assembly !== this.#followedAssembly) {
      this.#followedPC = pc;
      this.#followedAssembly = model.assembly;
      this.#reveal(pc);
    }
    this.#draw();
  }

  #toggleBreakpoint(event: MouseEvent): void {
    const row = (event.target as Element | null)?.closest<HTMLElement>(".memory-row");
    const address = Number(row?.dataset.address ?? Number.NaN);
    if (Number.isInteger(address)) this.#store.toggleAddress(address);
  }

  #reveal(address: number): void {
    const top = address * ROW_HEIGHT;
    const { scrollTop, clientHeight } = this.#scroll;
    if (top < scrollTop || top + ROW_HEIGHT > scrollTop + clientHeight) {
      this.#scroll.scrollTop = Math.max(0, top - (clientHeight - ROW_HEIGHT) / 2);
    }
  }

  #draw(): void {
    const model = this.#model;
    if (!model) return;

    const first = Math.min(MEMORY_SIZE - 1, Math.floor(this.#scroll.scrollTop / ROW_HEIGHT));
    const count = Math.min(MEMORY_SIZE - first, Math.ceil(this.#scroll.clientHeight / ROW_HEIGHT) + 1);
    while (this.#pool.length < count) this.#pool.push(this.#createRow());
    this.#rows.style.transform = `translateY(${first * ROW_HEIGHT}px)`;

    const pc = model.state.PC;
    const changed = model.changedAddresses;
    const breakpoints = new Map(
      this.#store.items.flatMap((item) => (item.kind === "address" ? [[item.address, item.enabled] as const] : [])),
    );

    this.#pool.forEach((row, index) => {
      const address = first + index;
      row.node.hidden = index >= count;
      if (index >= count) return;
      const word = model.wordAt(address);
      row.node.dataset.address = String(address);
      row.address.textContent = hex(address, 3);
      row.word.textContent = hex(word, 4);
      row.instruction.textContent = disassemble(word)?.text ?? "";
      row.node.classList.toggle("pc", address === pc);
      row.node.classList.toggle("changed", changed.has(address));
      row.node.classList.toggle("breakpoint", breakpoints.has(address));
      row.node.classList.toggle("off", breakpoints.get(address) === false);
    });
  }

  #createRow(): Row {
    const row = {
      node: create("div", "memory-row"),
      address: create("span", "address"),
      word: create("span", "word"),
      instruction: create("span", "instruction"),
    };
    row.node.title = "Click to break here";
    row.node.append(create("span", "bp"), row.address, row.word, row.instruction);
    this.#rows.append(row.node);
    return row;
  }
}
