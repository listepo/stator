// @mode: js
// @verdict: dynamic
// SUBSET.md: Map with object or unknown keys

const m = new Map();
m.set({ id: 1 }, 42);
console.log(m.size);
