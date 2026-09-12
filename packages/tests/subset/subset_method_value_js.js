// @mode: js
// @verdict: dynamic
// SUBSET.md: method values (docs/VALUE.md §4.16)

class Box {
  add(a, b) {
    return a + b;
  }
}
const g = new Box().add;
console.log(g(1, 2));
