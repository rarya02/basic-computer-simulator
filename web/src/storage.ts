import { isBreakpoint } from "./breakpoints.ts";
import type { Breakpoint } from "./breakpoints.ts";

const KEY = "mano-basic-computer.workspace";

export interface Workspace {
  readonly source: string;
  /** Name of the programs/ example the source came from, or "" once it came from elsewhere. */
  readonly program: string;
  readonly breakpoints: readonly Breakpoint[];
}

/** Storage can throw or hold anything, so a workspace that fails to read is simply absent. */
export function readWorkspace(storage: Pick<Storage, "getItem" | "setItem"> | null): Workspace | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { source, program, breakpoints } = parsed as Record<string, unknown>;
    if (typeof source !== "string") return null;
    return {
      source,
      program: typeof program === "string" ? program : "",
      breakpoints: Array.isArray(breakpoints) ? breakpoints.filter(isBreakpoint) : [],
    };
  } catch {
    return null;
  }
}

export function writeWorkspace(storage: Pick<Storage, "getItem" | "setItem"> | null, workspace: Workspace): void {
  try {
    storage?.setItem(KEY, JSON.stringify(workspace));
  } catch {
    // A full or blocked store only costs the user their restored source.
  }
}
