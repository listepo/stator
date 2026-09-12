// @mode: ts
// @verdict: static
// SUBSET.md: method values (docs/VALUE.md §4.16)

class Box {
  add(a: number, b: number): number {
    return a + b;
  }
}
const g = new Box().add;
console.log(g(1, 2));
