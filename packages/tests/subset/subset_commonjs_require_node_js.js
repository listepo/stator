// @mode: js
// @verdict: error
// @code: STA1110
// @node: true
// SUBSET.md: CommonJS require() — under --node in js mode, a require beside ES-module syntax is
// Node's ReferenceError; an ES module gets one from createRequire(import.meta.url) (plan-notes 316).

require("module");
export {};
