// The Node platform's globals and global types (plan.md §11c T11.5, T11.6): a root file of every
// `--node` program, beside the compiler's own `stator.globals.d.ts`.

/** `import.meta` under `--node`: the module's location, resolved at run time beside the
 * executable (docs/MODES.md §6). */
interface ImportMeta {
  readonly url: string;
  readonly filename: string;
  readonly dirname: string;
}

/** The function `createRequire` returns. Its answer is typed the way `JSON.parse`'s is, since the
 * id is a run-time string: in `ts` mode the caller annotates it; in `js` mode it is dynamic. */
interface NodeRequire {
  (id: string): ReturnType<typeof JSON.parse>;
}
