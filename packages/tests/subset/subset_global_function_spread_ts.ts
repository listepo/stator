// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Global functions

// A spread's count is not the node's arity.
const args: [string, number] = ['ff', 16];
console.log(parseInt(...args));
