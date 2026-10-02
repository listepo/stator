// @mode: js
// @verdict: error
// @code: STA1110
// @node: true
// SUBSET.md: `__filename` / `__dirname` — under --node an ES module has neither, as in Node;
// only a CommonJS file built through a bundler gets them injected (plan-notes 316).

const at = { __dirname };
console.log(__dirname, at);
export {};
