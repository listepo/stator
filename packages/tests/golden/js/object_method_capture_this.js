// plan.md §8 step 36: an object-literal method reading both `this` and a captured
// local gets the call-site receiver with the construction-site environment.

function make() {
  const n = 10;
  return {
    v: 1,
    get() {
      return this.v + n;
    },
  };
}

console.log(make().get());
