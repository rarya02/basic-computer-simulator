import { create, element } from "../dom.ts";
import type { ViewModel } from "../view-model.ts";

export class ProfilerPanel {
  readonly #cycles = element("profile-cycles", HTMLElement);
  readonly #instructions = element("profile-instructions", HTMLElement);
  readonly #cpi = element("profile-cpi", HTMLElement);
  readonly #mix = element("instruction-mix", HTMLElement);

  render(model: ViewModel): void {
    const { cycles, instructions } = model;
    this.#cycles.textContent = String(cycles);
    this.#instructions.textContent = String(instructions);
    this.#cpi.textContent = instructions > 0 ? (cycles / instructions).toFixed(2) : "n/a";

    const entries = [...model.mix].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
    const most = entries[0]?.[1] ?? 0;
    if (entries.length === 0) {
      this.#mix.replaceChildren(create("p", "empty", "No instruction has completed yet."));
      return;
    }

    this.#mix.replaceChildren(
      ...entries.flatMap(([mnemonic, count]) => {
        const fill = create("span");
        fill.style.width = `${(100 * count) / most}%`;
        const bar = create("div", "bar");
        bar.append(fill);
        const share = Math.round((100 * count) / instructions);
        return [create("span", "mnemonic", mnemonic), bar, create("span", "count", `${count} (${share}%)`)];
      }),
    );
  }
}
