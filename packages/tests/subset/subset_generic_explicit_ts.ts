// @mode: ts
// @verdict: dynamic
// SUBSET.md: Generics — explicit type arguments on a call name the same specialization
// inference would: the checker applies them in the resolved signature, which is what the
// tuple is unified from. Dynamic for the `<unknown>` call, whose value is genuinely dynamic.

function box<T>(item: T): T {
  return item;
}
console.log(box<string>("a"));
console.log(box<number>(42));

function pair<A, B>(first: A, second: B): string {
  return `${first}/${second}`;
}
console.log(pair<string, number>("one", 1));

const x: unknown = box<unknown>(42);
console.log(x === 42);
