import { compileCondition, isBreakpoint } from "./breakpoints.ts";
import type { Breakpoint } from "./breakpoints.ts";

export type AddResult = { readonly ok: true; readonly breakpoint: Breakpoint } | { readonly ok: false; readonly message: string };

/**
 * The debugger's own settings, which are not machine state: the panels still read
 * every register and memory word from the step events.
 */
export class BreakpointStore {
  #items: Breakpoint[] = [];
  #nextId = 1;
  #revision = 0;
  readonly #listeners: (() => void)[] = [];

  get items(): readonly Breakpoint[] {
    return this.#items;
  }

  /** Bumped on every change, so panels can skip rebuilding their list. */
  get revision(): number {
    return this.#revision;
  }

  onChange(listener: () => void): void {
    this.#listeners.push(listener);
  }

  hasAddress(address: number): boolean {
    return this.#items.some((item) => item.kind === "address" && item.address === address);
  }

  toggleAddress(address: number): void {
    const existing = this.#items.find((item) => item.kind === "address" && item.address === address);
    if (existing) this.#items = this.#items.filter((item) => item !== existing);
    else this.#items.push({ id: this.#id(), enabled: true, kind: "address", address });
    this.#changed();
  }

  addAddress(address: number): AddResult {
    if (this.hasAddress(address)) return { ok: false, message: `address ${address.toString(16).toUpperCase().padStart(3, "0")} already has a breakpoint` };

    const breakpoint: Breakpoint = { id: this.#id(), enabled: true, kind: "address", address };
    this.#items.push(breakpoint);
    this.#changed();
    return { ok: true, breakpoint };
  }

  addCondition(expression: string): AddResult {
    const trimmed = expression.trim();
    const compiled = compileCondition(trimmed);
    if (!compiled.ok) return compiled;
    if (this.#items.some((item) => item.kind === "condition" && item.expression === trimmed)) {
      return { ok: false, message: `'${trimmed}' is already a breakpoint` };
    }

    const breakpoint: Breakpoint = { id: this.#id(), enabled: true, kind: "condition", expression: trimmed };
    this.#items.push(breakpoint);
    this.#changed();
    return { ok: true, breakpoint };
  }

  toggle(id: string): void {
    this.#items = this.#items.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item));
    this.#changed();
  }

  remove(id: string): void {
    this.#items = this.#items.filter((item) => item.id !== id);
    this.#changed();
  }

  clear(): void {
    this.#items = [];
    this.#changed();
  }

  /** Replaces the list wholesale, dropping anything that is not a valid breakpoint. */
  replaceAll(items: readonly unknown[]): void {
    this.#items = items.filter(isBreakpoint).map((item) => ({ ...item }));
    for (const item of this.#items) {
      const suffix = Number(item.id.replace(/^bp-/, ""));
      if (Number.isInteger(suffix) && suffix >= this.#nextId) this.#nextId = suffix + 1;
    }
    this.#changed();
  }

  #id(): string {
    return `bp-${this.#nextId++}`;
  }

  #changed(): void {
    this.#revision += 1;
    for (const listener of this.#listeners) listener();
  }
}
