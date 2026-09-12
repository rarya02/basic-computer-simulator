import { element } from "../dom.ts";
import { hex } from "../format.ts";
import type { Command } from "../protocol.ts";
import type { ViewModel } from "../view-model.ts";

const RETURN_KEY = 0x0d;

const printable = (value: number) => value >= 0x20 && value <= 0x7e;

const describeByte = (value: number) => (printable(value) ? `${hex(value, 2)} '${String.fromCharCode(value)}'` : hex(value, 2));

export class IOPanel {
  readonly #send: (command: Command) => void;
  readonly #inpr = element("io-inpr", HTMLElement);
  readonly #fgi = element("io-fgi", HTMLElement);
  readonly #outr = element("io-outr", HTMLElement);
  readonly #fgo = element("io-fgo", HTMLElement);
  readonly #ien = element("io-ien", HTMLElement);
  readonly #r = element("io-r", HTMLElement);
  readonly #input = element("io-input", HTMLInputElement);
  readonly #hint = element("io-hint", HTMLElement);
  readonly #output = element("io-output", HTMLElement);
  readonly #interrupt = element("io-interrupt", HTMLElement);

  constructor(send: (command: Command) => void) {
    this.#send = send;
    this.#input.addEventListener("keydown", (event) => this.#type(event));
    element("io-ready", HTMLButtonElement).addEventListener("click", () => send({ type: "outputReady" }));
  }

  render(model: ViewModel): void {
    const state = model.state;
    this.#inpr.textContent = describeByte(state.INPR);
    this.#outr.textContent = describeByte(state.OUTR);
    this.#fgi.textContent = String(state.FGI);
    this.#fgo.textContent = String(state.FGO);
    this.#ien.textContent = String(state.IEN);
    this.#r.textContent = String(state.R);

    const text = model.output
      .map((entry) => (printable(entry.value) ? String.fromCharCode(entry.value) : `[${hex(entry.value, 2)}]`))
      .join("");
    this.#output.textContent = text === "" ? "Nothing printed yet." : text;
    this.#output.classList.toggle("waiting", text === "");

    this.#interrupt.classList.toggle("pending", state.R === 1);
    this.#interrupt.textContent = this.#interruptText(model);
  }

  #interruptText(model: ViewModel): string {
    const { R, IEN } = model.state;
    if (R === 1) return "R = 1: the next fetch is diverted, and PC is saved to M[000] first.";

    const interrupt = model.interrupt;
    if (interrupt) {
      return (
        `Cycle ${interrupt.cycle}: the fetch was diverted, return address ${hex(interrupt.returnAddress, 3)} ` +
        `saved to M[${hex(interrupt.savedAt, 3)}], service routine entered at ${hex(interrupt.vector, 3)}.`
      );
    }
    return IEN === 1 ? "IEN = 1: an interrupt runs once FGI or FGO is set." : "IEN = 0: interrupts are disabled.";
  }

  #type(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const character = event.key === "Enter" ? RETURN_KEY : event.key.length === 1 ? (event.key.codePointAt(0) ?? -1) : -1;
    if (character < 0 || character > 0xff) return;

    event.preventDefault();
    this.#send({ type: "input", character });
    this.#input.value = event.key === "Enter" ? "Enter" : event.key;
    this.#hint.textContent = `Sent ${describeByte(character)} to INPR, FGI = 1.`;
  }
}
