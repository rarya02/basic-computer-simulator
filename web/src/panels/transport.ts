import type { BreakpointStore } from "../breakpoint-store.ts";
import { describeBreakpoint } from "../breakpoints.ts";
import { element } from "../dom.ts";
import type { Command } from "../protocol.ts";
import type { ViewModel } from "../view-model.ts";

export class TransportBar {
  readonly #store: BreakpointStore;
  readonly #stepCycle = element("step-cycle", HTMLButtonElement);
  readonly #stepInstruction = element("step-instruction", HTMLButtonElement);
  readonly #run = element("run", HTMLButtonElement);
  readonly #stop = element("stop", HTMLButtonElement);
  readonly #reset = element("reset", HTMLButtonElement);
  readonly #stepBack = element("step-back", HTMLButtonElement);
  readonly #cycles = element("cycle-count", HTMLElement);
  readonly #instructions = element("instruction-count", HTMLElement);
  readonly #status = element("run-status", HTMLElement);

  constructor(send: (command: Command) => void, store: BreakpointStore) {
    this.#store = store;

    const bindings: [HTMLButtonElement, Command][] = [
      [this.#stepCycle, { type: "step" }],
      [this.#stepInstruction, { type: "stepInstruction" }],
      [this.#run, { type: "run" }],
      [this.#stop, { type: "stop" }],
      [this.#reset, { type: "reset" }],
      [this.#stepBack, { type: "back" }],
    ];
    for (const [button, command] of bindings) button.addEventListener("click", () => send(command));
  }

  render(model: ViewModel): void {
    const { running, halted, canStepBack } = model.status;
    const assembly = model.assembly;

    // Loading a program and reset stay available during a run, since both stop it first.
    for (const button of [this.#stepCycle, this.#stepInstruction, this.#run]) button.disabled = running || halted;
    this.#stop.disabled = !running;
    this.#reset.disabled = assembly === null;
    this.#stepBack.disabled = running || !canStepBack;

    this.#cycles.textContent = String(model.cycles);
    this.#instructions.textContent = String(model.instructions);
    this.#status.textContent = this.#statusText(model);
  }

  #statusText(model: ViewModel): string {
    if (model.error) return model.error;
    const assembly = model.assembly;
    if (assembly === null) return "Loading";
    if (!assembly.ok) return "Assembly errors";
    if (model.status.running) return "Running";

    const hit = model.hit;
    if (hit) {
      const breakpoint = this.#store.items.find((item) => item.id === hit.id);
      return `Stopped at ${breakpoint ? describeBreakpoint(breakpoint) : "a breakpoint"}`;
    }
    return model.status.halted ? "Halted" : "Ready";
  }
}
