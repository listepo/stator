// The depth cap abbreviates EMPTY containers in full (plan.md §8 step 30 A11):
// Node prints `[[[[]]]]` as `[ [ [ [] ] ] ]`, not `[ [ [ [Array] ] ] ]` —
// emptiness is checked before depth, for arrays, objects, Maps/Sets and class
// instances alike. Only the non-empty container past the cap abbreviates.

console.log([[[]]]);
console.log([[[[]]]]);
console.log([[[[[]]]]]);
console.log({ a: { b: { c: {} } } });
console.log({ a: { b: { c: { d: 1 } } } });
console.log([[{}]]);
console.log([[[{ a: 1 }]]]);

const emptyMap = new Map();
console.log([emptyMap]);
console.log([[emptyMap]]);
console.log([[[emptyMap]]]);
const fullMap = new Map();
fullMap.set('k', 1);
console.log([[[fullMap]]]);

const emptySet = new Set();
console.log([emptySet]);
console.log([[[emptySet]]]);
const fullSet = new Set();
fullSet.add(1);
console.log([[[fullSet]]]);

class Empty {}
console.log(new Empty());
console.log([[new Empty()]]);
console.log([[[new Empty()]]]);
class Full {
  constructor() {
    this.x = 1;
  }
}
console.log([[new Full()]]);
console.log([[[new Full()]]]);
