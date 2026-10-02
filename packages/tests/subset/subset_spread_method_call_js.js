// @mode: js
// @verdict: dynamic
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
// `o.m(...xs)` reads `m` through the shape table and passes `o` as `this` (plan.md §11c T11.4
// step 5): a plain object, a class instance, an array's variadic method, a function's own property.
const o = {
  n: 2,
  scale(...xs) {
    return xs.map((x) => x * this.n);
  },
};
class K {
  constructor(n) {
    this.n = n;
  }
  add(a, b) {
    return this.n + a + b;
  }
}
function tag() {}
tag.join = (...xs) => xs.join('-');
const list = [0];
list.push(...[1, 2], ...'34');
console.log(o.scale(...[1, 2]), new K(10).add(...[1, 2]), tag.join(...list));
