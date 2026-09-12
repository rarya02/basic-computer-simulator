import "./style.css";
import { BreakpointStore } from "./breakpoint-store.ts";
import { BreakpointsPanel } from "./panels/breakpoints.ts";
import { DatapathPanel } from "./panels/datapath.ts";
import { IOPanel } from "./panels/io.ts";
import { MemoryPanel } from "./panels/memory.ts";
import { ProfilerPanel } from "./panels/profiler.ts";
import { ProgramPanel } from "./panels/program.ts";
import { RegisterPanel } from "./panels/registers.ts";
import { TransportBar } from "./panels/transport.ts";
import { PROGRAMS } from "./programs.ts";
import type { Command, Report } from "./protocol.ts";
import { readWorkspace, writeWorkspace } from "./storage.ts";
import { ViewModel } from "./view-model.ts";

const FIRST_PROGRAM = "multiply";

function openStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Storage can be blocked outright, which only costs the restored source.
    return null;
  }
}

const storage = openStorage();
const saved = readWorkspace(storage);
const fallback = PROGRAMS.has(FIRST_PROGRAM) ? FIRST_PROGRAM : (PROGRAMS.keys().next().value ?? "");
const program = saved?.program ?? fallback;
const source = saved?.source ?? PROGRAMS.get(fallback) ?? "";

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const send = (command: Command) => worker.postMessage(command);
const model = new ViewModel();
const store = new BreakpointStore();
store.replaceAll(saved?.breakpoints ?? []);

let workspace = { source, program };
const persist = (text: string, name: string) => {
  workspace = { source: text, program: name };
  writeWorkspace(storage, { ...workspace, breakpoints: store.items });
};

const panels = [
  new ProgramPanel({ send, programs: PROGRAMS, store, source, program, persist }),
  new TransportBar(send, store),
  new DatapathPanel(),
  new RegisterPanel(),
  new MemoryPanel(store),
  new BreakpointsPanel(store),
  new IOPanel(send),
  new ProfilerPanel(),
];

// A run delivers many reports per frame, so the panels redraw at most once per frame.
let frame = 0;
function draw(): void {
  if (frame !== 0) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    for (const panel of panels) panel.render(model);
  });
}

function receive(report: Report): void {
  model.apply(report);
  draw();
}

worker.addEventListener("message", (message: MessageEvent<Report>) => receive(message.data));
worker.addEventListener("error", (error) => receive({ type: "error", message: error.message || "The simulator worker failed" }));

store.onChange(() => {
  send({ type: "breakpoints", breakpoints: store.items });
  writeWorkspace(storage, { ...workspace, breakpoints: store.items });
  draw();
});

send({ type: "breakpoints", breakpoints: store.items });
send({ type: "load", source });
