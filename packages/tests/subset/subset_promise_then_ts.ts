// @mode: ts
// @verdict: static
// SUBSET.md: Promise.prototype.then / finally
// new Promise's lib executor types `reject` as any, so a constructor fixture would report
// dynamic; the golden `promise_then.ts` is what proves `new Promise` and `.catch`.

console.log(Promise.resolve(1).then((n: number) => n + 1));
console.log(Promise.resolve(1).finally(() => undefined));
