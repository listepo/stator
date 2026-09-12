// plan.md §8 step 12(c): object-literal method members call with the receiver as `this`.

const o = {
  v: 1,
  m() {
    return this.v + 1;
  },
};
console.log(o.m());
