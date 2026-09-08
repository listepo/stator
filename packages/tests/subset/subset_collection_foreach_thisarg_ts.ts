// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Map, Set
// The thisArg form is refused for the same reason the array callback ops refuse it: there is no
// `this` to bind in a compiled callback the runtime calls through jsrt_call.

const m = new Map<string, number>();
m.set('a', 1);
m.forEach((v: number): void => {
  console.log(v);
}, {});
