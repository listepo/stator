// @mode: ts
// @verdict: static
// SUBSET.md: Map, Set
// forEach takes a CALLBACK, not an iterator: the runtime calls it through jsrt_call, the same
// closure ABI the Array.prototype callback methods use. The iterator forms stay deferred.

const m = new Map<string, number>();
m.set('a', 1);
m.forEach((v: number, k: string): void => {
  console.log(`${k}=${v}`);
});

const s = new Set<number>();
s.add(1);
s.forEach((v: number): void => {
  console.log(v);
});
