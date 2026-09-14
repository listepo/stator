// plan.md §8 step 36: an object-literal method capturing a parameter binds at
// construction; each call closes over its own argument.

function make(start: number) {
  return {
    get(): number {
      return start;
    },
  };
}

const m = make(41);
console.log(m.get());
console.log(make(7).get());
