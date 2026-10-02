// @mode: ts
// @verdict: error
// @code: STA1110
// SUBSET.md: `__filename` / `__dirname` — without --node, ES modules only (plan-notes 316).

const at = { __filename };
console.log(__filename, at);
export {};
