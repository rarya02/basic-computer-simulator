import type { BreakpointStore } from "../breakpoint-store.ts";
import { describeBreakpoint, parseAddress } from "../breakpoints.ts";
import { create, element } from "../dom.ts";
import type { ViewModel } from "../view-model.ts";

export class BreakpointsPanel {
  readonly #store: BreakpointStore;
  readonly #form = element("breakpoint-form", HTMLFormElement);
  readonly #kind = element("breakpoint-kind", HTMLSelectElement);
  readonly #text = element("breakpoint-text", HTMLInputElement);
  readonly #error = element("breakpoint-error", HTMLElement);
  readonly #list = element("breakpoint-list", HTMLUListElement);
  readonly #empty = element("breakpoint-empty", HTMLElement);
  #revision = -1;
  #hit: string | null = null;

  constructor(store: BreakpointStore) {
    this.#store = store;

    this.#kind.addEventListener("change", () => {
      this.#text.placeholder = this.#kind.value === "address" ? "110" : "AC == 0";
      this.#showError(null);
    });
    this.#form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.#add();
    });
    this.#list.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      const id = this.#idOf(target);
      if (id && target?.classList.contains("remove")) this.#store.remove(id);
    });
    this.#list.addEventListener("change", (event) => {
      const id = this.#idOf(event.target as Element | null);
      if (id) this.#store.toggle(id);
    });
  }

  render(model: ViewModel): void {
    const hit = model.hit?.id ?? null;
    if (this.#store.revision === this.#revision && hit === this.#hit) return;
    this.#revision = this.#store.revision;
    this.#hit = hit;
    this.#build();
  }

  #build(): void {
    const items = this.#store.items;
    this.#empty.hidden = items.length > 0;
    this.#list.replaceChildren(
      ...items.map((breakpoint) => {
        const item = create("li", "breakpoint-item");
        item.dataset.id = breakpoint.id;
        item.classList.toggle("off", !breakpoint.enabled);
        item.classList.toggle("hit", breakpoint.id === this.#hit);

        const toggle = create("input");
        toggle.type = "checkbox";
        toggle.checked = breakpoint.enabled;
        toggle.title = breakpoint.enabled ? "Disable" : "Enable";

        const remove = create("button", "remove", "×");
        remove.type = "button";
        remove.title = "Remove";

        const label = create("span", "label", describeBreakpoint(breakpoint));
        if (breakpoint.id === this.#hit) label.title = "Stopped the last run";
        item.append(toggle, label, remove);
        return item;
      }),
    );
  }

  #add(): void {
    const text = this.#text.value.trim();
    if (!text) {
      this.#showError("enter an address or a condition");
      return;
    }

    if (this.#kind.value === "address") {
      const address = parseAddress(text);
      if (address === null) {
        this.#showError(`'${text}' is not an address from 000 to FFF`);
        return;
      }
      const added = this.#store.addAddress(address);
      if (!added.ok) {
        this.#showError(added.message);
        return;
      }
    } else {
      const added = this.#store.addCondition(text);
      if (!added.ok) {
        this.#showError(added.message);
        return;
      }
    }

    this.#text.value = "";
    this.#showError(null);
  }

  #showError(message: string | null): void {
    this.#error.textContent = message ?? "";
    this.#error.hidden = message === null;
  }

  #idOf(target: Element | null): string | undefined {
    return target?.closest<HTMLElement>(".breakpoint-item")?.dataset.id;
  }
}
