// @mode: js
// @verdict: dynamic
// SUBSET.md: Generics — explicit type arguments on a call name the same specialization
// inference would: the checker applies them in the resolved signature, which is what the
// tuple is unified from. Dynamic for the `<unknown>` call, whose value is genuinely dynamic.

function box<T>(item: T): T {
  return item;
}
console.log(box<string>("b"));
console.log(box<number>(43));

function pair<A, B>(first: A, second: B): string {
  return `${first}/${second}`;
}
console.log(pair<string, number>("two", 2));

const x: unknown = box<unknown>(43);
console.log(x === 43);
