// Monomorphization: one function per concrete type tuple (plan.md §5 Task 3.4).

function box<T>(item: T): T {
  return item;
}

// Two calls, one number specialization: the checker infers T = 42 and T = 7, both of which map to
// `number`, so `box<number>` is emitted once and shared.
console.log(box(42));
console.log(box(7));
console.log(box("hello"));
console.log(box(true));

function pair<A, B>(first: A, second: B): string {
  return `${first}/${second}`;
}
console.log(pair(1, "one"));
console.log(pair("two", 2));

// A generic calling a generic: the substitution flows through.
function twice<T>(item: T): T {
  return box(box(item));
}
console.log(twice(3.5));
console.log(twice("z"));

// An array of a type parameter, so the tuple is a compound type rather than a scalar.
function countOf<T>(items: T[]): number {
  let n = 0;
  for (const item of items) {
    n = n + items.length - items.length;
    n = n + 1;
    box(item);
  }
  return n;
}
console.log(countOf([1, 2, 3]));
console.log(countOf(["a"]));

// The same generic reached through two different argument types in one expression.
console.log(box(box(1)) + box(2));
