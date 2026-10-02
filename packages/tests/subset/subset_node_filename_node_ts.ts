// @mode: ts
// @verdict: error
// @code: STA1110
// @node: true
// SUBSET.md: `__filename` / `__dirname` — under --node ts mode uses ES modules only, flag or not (plan-notes 316).

const at = { __filename };
console.log(__filename, at);
export {};
