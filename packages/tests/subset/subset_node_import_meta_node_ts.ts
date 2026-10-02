// @mode: ts
// @verdict: dynamic
// @node: true
// SUBSET.md: `import.meta` — under --node `url`, `filename` and `dirname` are where the module sits
// relative to the executable, resolved at run time (docs/MODES.md §6, plan-notes 316); dynamic
// because the helpers reach node:path, whose graph holds std/env (`get` answers a union).

const meta = [import.meta.url, import.meta.filename, import.meta.dirname];
console.log(meta.length);
export {};
