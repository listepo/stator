// @mode: ts
// @verdict: dynamic
// SUBSET.md: Map with object or unknown keys

// `object` describes no layout, so the key type is Unknown -- the map still works (keys compare by
// identity), it is simply not statically typed.
const m = new Map<object, number>();
m.set({ id: 1 }, 42);
console.log(m.size);
