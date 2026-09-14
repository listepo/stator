// An object literal mixing identifier and integer-like keys (plan.md §8 step 37): both
// spellings take fixed slots, enumerate integer-like keys first per OrdinaryOwnPropertyKeys,
// and carry methods that read the receiver.
const o = { a: 1, 10: 2 };
console.log(JSON.stringify(o));
console.log(o.a);
console.log(Object.keys(o).join(","));

const m = {
  a: 1,
  10: 2,
  greet(): string {
    return "hi " + this.a;
  },
};
console.log(m.greet());
console.log(JSON.stringify(m));
