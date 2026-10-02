// @mode: ts
// @verdict: error
// @code: STA1110
// @node: true
// SUBSET.md: CommonJS require() — ts mode stays ES modules only under --node.

require("module");
export {};
