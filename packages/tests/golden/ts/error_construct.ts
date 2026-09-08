// The ts-mode twin of js/error_construct.js: the standard Error classes are a typed construct, so
// the default mode carries the same proof (plan.md §8 step 2a(c)).
const e = new TypeError('bad input');
console.log(e.name);
console.log(e.message);
console.log(e instanceof TypeError);
console.log(e instanceof Error);
console.log(e instanceof RangeError);

const bare = new Error();
console.log(bare.message === '');
console.log(bare.name);

function boom(): void {
  throw new RangeError('out of range');
}
try {
  boom();
} catch (caught) {
  // `useUnknownInCatchVariables` stays ON in ts mode (§0.2), so the caught value arrives as
  // `unknown` and the `instanceof` is what narrows it -- the boundary rule doing its job on the one
  // value the language hands you untyped. This is the ts-mode half of what makes the model useful:
  // an error you cannot narrow is an error you cannot route.
  if (caught instanceof RangeError) {
    console.log(caught.name + ': ' + caught.message);
  }
  if (caught instanceof TypeError) {
    console.log('unreachable');
  }
  console.log(caught instanceof Error);
}
