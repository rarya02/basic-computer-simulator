const modules = import.meta.glob<string>("../../programs/*.asm", { query: "?raw", import: "default", eager: true });

/** The shared programs/ examples, bundled at build time and keyed by file name. */
export const PROGRAMS: ReadonlyMap<string, string> = new Map(
  Object.entries(modules)
    .map(([path, source]): [string, string] => [path.slice(path.lastIndexOf("/") + 1, -".asm".length), source])
    .sort(([a], [b]) => a.localeCompare(b)),
);
