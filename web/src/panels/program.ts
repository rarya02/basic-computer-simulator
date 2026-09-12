import type { AssembledWord, AssemblyResult } from "../../../core/index.ts";
import type { BreakpointStore } from "../breakpoint-store.ts";
import { create, element } from "../dom.ts";
import { hex } from "../format.ts";
import type { Command } from "../protocol.ts";
import type { ViewModel } from "../view-model.ts";

/** Shared by the textarea, the gutter rows and the highlight stripes so they line up. */
const LINE_HEIGHT = 20;
const PERSIST_DELAY = 300;

export interface ProgramPanelOptions {
  readonly send: (command: Command) => void;
  readonly programs: ReadonlyMap<string, string>;
  readonly store: BreakpointStore;
  readonly source: string;
  readonly program: string;
  readonly persist: (source: string, program: string) => void;
}

export class ProgramPanel {
  readonly #send: (command: Command) => void;
  readonly #programs: ReadonlyMap<string, string>;
  readonly #store: BreakpointStore;
  readonly #persist: (source: string, program: string) => void;

  readonly #select = element("program", HTMLSelectElement);
  readonly #editor = element("editor", HTMLTextAreaElement);
  readonly #gutterRows = element("gutter-rows", HTMLElement);
  readonly #highlightRows = element("highlight-rows", HTMLElement);
  readonly #diagnostics = element("diagnostics", HTMLUListElement);
  readonly #dirty = element("dirty", HTMLElement);
  readonly #file = element("file", HTMLInputElement);
  readonly #currentStripe = create("div", "stripe current");

  #model: ViewModel | null = null;
  #assembly: AssemblyResult | null = null;
  #program: string;
  /** The source the machine was last loaded with, which is what "unsaved edits" compares against. */
  #loaded = "";
  #builtFrom: string | null = null;
  #revision = -1;
  #shownLine = 0;
  #timer = 0;

  constructor(options: ProgramPanelOptions) {
    this.#send = options.send;
    this.#programs = options.programs;
    this.#store = options.store;
    this.#persist = options.persist;
    this.#program = options.programs.has(options.program) ? options.program : "";

    this.#select.add(new Option("Custom", ""));
    for (const name of options.programs.keys()) this.#select.add(new Option(name, name));
    this.#select.value = this.#program;
    this.#editor.value = options.source;
    this.#currentStripe.hidden = true;

    this.#editor.addEventListener("input", () => {
      this.#rebuild();
      this.#showDirty();
      this.#schedulePersist();
    });
    this.#editor.addEventListener("scroll", () => this.#syncScroll(), { passive: true });
    this.#select.addEventListener("change", () => this.#chooseProgram());
    element("assemble", HTMLButtonElement).addEventListener("click", () => this.#assemble());
    element("open", HTMLButtonElement).addEventListener("click", () => this.#file.click());
    element("save", HTMLButtonElement).addEventListener("click", () => this.#save());
    this.#file.addEventListener("change", () => void this.#openFile());
    this.#gutterRows.addEventListener("click", (event) => this.#toggleBreakpoint(event));

    this.#rebuild();
  }

  render(model: ViewModel): void {
    this.#model = model;
    this.#loaded = model.source;

    if (model.assembly !== this.#assembly || this.#store.revision !== this.#revision || this.#builtFrom !== this.#editor.value) {
      this.#assembly = model.assembly;
      this.#revision = this.#store.revision;
      this.#rebuild();
    }

    this.#showDirty();
    this.#showCurrent(model);
  }

  /** Edits only reach the machine through Assemble, so anything else is unsaved. */
  #showDirty(): void {
    this.#dirty.hidden = this.#editor.value === this.#loaded;
  }

  #rebuild(): void {
    this.#builtFrom = this.#editor.value;
    const lines = this.#builtFrom.split("\n");
    const words = new Map((this.#assembly?.words ?? []).map((word): [number, AssembledWord] => [word.line, word]));
    const diagnostics = this.#assembly?.diagnostics ?? [];

    this.#gutterRows.replaceChildren(
      ...lines.map((_, index) => {
        const line = index + 1;
        const word = words.get(line);
        const breakpoint = word && this.#store.items.find((item) => item.kind === "address" && item.address === word.address);
        const row = create("div", "gutter-row");
        row.dataset.line = String(line);
        row.classList.toggle("breakpoint", breakpoint !== undefined);
        row.classList.toggle("off", breakpoint?.enabled === false);
        row.title = word ? `Click to break at ${hex(word.address, 3)}` : "";
        row.append(
          create("span", "bp"),
          create("span", "line-number", String(line)),
          create("span", "address", word ? hex(word.address, 3) : ""),
          create("span", "code", word ? hex(word.value, 4) : ""),
        );
        return row;
      }),
    );

    const stripes = diagnostics
      .filter((diagnostic) => diagnostic.severity === "error" && diagnostic.line <= lines.length)
      .map((diagnostic) => {
        const stripe = create("div", "stripe error");
        stripe.style.top = `${(diagnostic.line - 1) * LINE_HEIGHT}px`;
        stripe.title = diagnostic.message;
        return stripe;
      });
    this.#highlightRows.replaceChildren(...stripes, this.#currentStripe);

    this.#diagnostics.replaceChildren(
      ...diagnostics.map((diagnostic) => {
        const item = create("li", diagnostic.severity, `${diagnostic.line}:${diagnostic.column} ${diagnostic.severity}: ${diagnostic.message}`);
        item.addEventListener("click", () => this.#focusLine(diagnostic.line));
        return item;
      }),
    );
    this.#diagnostics.hidden = diagnostics.length === 0;
    this.#syncScroll();
  }

  #showCurrent(model: ViewModel): void {
    const current = model.current;
    this.#currentStripe.hidden = current === null;
    if (!current) {
      this.#shownLine = 0;
      return;
    }

    this.#currentStripe.classList.toggle("pending", current.pending);
    this.#currentStripe.style.transform = `translateY(${(current.line - 1) * LINE_HEIGHT}px)`;
    if (current.line !== this.#shownLine) {
      this.#shownLine = current.line;
      this.#revealLine(current.line);
    }
  }

  #revealLine(line: number): void {
    const top = (line - 1) * LINE_HEIGHT;
    const { scrollTop, clientHeight } = this.#editor;
    if (top < scrollTop || top + LINE_HEIGHT > scrollTop + clientHeight) {
      this.#editor.scrollTop = Math.max(0, top - (clientHeight - LINE_HEIGHT) / 2);
      this.#syncScroll();
    }
  }

  #syncScroll(): void {
    const offset = `translateY(${-this.#editor.scrollTop}px)`;
    this.#gutterRows.style.transform = offset;
    this.#highlightRows.style.transform = offset;
  }

  #chooseProgram(): void {
    const name = this.#select.value;
    const source = this.#programs.get(name);
    if (source === undefined || !this.#mayDiscard(`Discard unsaved edits and load ${name}?`)) {
      this.#select.value = this.#program;
      return;
    }
    this.#program = name;
    this.#replace(source);
  }

  async #openFile(): Promise<void> {
    const file = this.#file.files?.[0];
    this.#file.value = "";
    if (!file) return;

    const text = await file.text();
    if (!this.#mayDiscard(`Discard unsaved edits and load ${file.name}?`)) return;
    this.#program = "";
    this.#select.value = "";
    this.#replace(text);
  }

  #mayDiscard(message: string): boolean {
    return this.#editor.value === this.#loaded || confirm(message);
  }

  #replace(source: string): void {
    this.#editor.value = source;
    this.#rebuild();
    this.#assemble();
  }

  #assemble(): void {
    this.#send({ type: "load", source: this.#editor.value });
    this.#persistNow();
  }

  #save(): void {
    const url = URL.createObjectURL(new Blob([this.#editor.value], { type: "text/plain" }));
    const link = create("a");
    link.href = url;
    link.download = `${this.#program || "program"}.asm`;
    link.click();
    URL.revokeObjectURL(url);
  }

  #toggleBreakpoint(event: MouseEvent): void {
    const row = (event.target as Element | null)?.closest<HTMLElement>(".gutter-row");
    const line = Number(row?.dataset.line ?? Number.NaN);
    const address = Number.isInteger(line) ? this.#model?.addressOfLine(line) : undefined;
    if (address !== undefined) this.#store.toggleAddress(address);
  }

  #focusLine(line: number): void {
    const lines = this.#editor.value.split("\n");
    const start = lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
    this.#editor.focus();
    this.#editor.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    this.#revealLine(line);
  }

  #schedulePersist(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#persistNow(), PERSIST_DELAY);
  }

  #persistNow(): void {
    clearTimeout(this.#timer);
    this.#persist(this.#editor.value, this.#program);
  }
}
