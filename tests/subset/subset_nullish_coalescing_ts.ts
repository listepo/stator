// @mode: ts
// @verdict: dynamic
// SUBSET.md: Nullish coalescing ??

// `??` itself is static -- it lowers to a rooted temporary and a nullish test, and `v` is a
// `number`. What makes the file dynamic is `x`: a binding declared `number | null` can hold either,
// and HType has no union yet, so it is Unknown. This flips back to static when unions land.
const x: number | null = null;
const v: number = x ?? 0;
console.log(v);
