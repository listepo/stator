// A `string[]` read from a backing one element at a time (`std/process.argv`, `std/fs.readdir`):
// a list cannot cross the extern edge (docs/FFI.md §2), so the backing parks it and answers a
// count and one string per index.

/** `count` strings, element `i` read by `at(i)`. The array starts as a one-element literal sliced
 * empty, because an empty `[]` lowers with an Unknown element type even under a `string[]`
 * annotation, and that one Unknown would make the module and its importers dynamic
 * (plan-notes 309). */
export function __stdStrings(count: number, at: (index: number) => string): string[] {
  const out = [''].slice(1);
  for (let i = 0; i < count; i++) {
    out.push(at(i));
  }
  return out;
}
