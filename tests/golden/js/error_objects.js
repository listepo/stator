// A thrown builtin error is a real Error OBJECT, not a string (plan.md §8 step 2a(c)).
// Before this, `jsrt_throw_str` threw the text "TypeError: ..." and a catch block could read
// neither `.name` nor `.message`, and `e instanceof TypeError` silently answered FALSE -- which is
// a wrong answer, not a missing feature, and is how a catch block mis-routes.
//
// Compiled modules are always strict (§1.2), which is why the frozen write throws here at all:
// in sloppy mode it fails silently. Node agrees because this file is ESM.
const frozen = Object.freeze({ a: 1 });
try {
  frozen.a = 2;
} catch (e) {
  console.log(e.name);
  console.log(e.message);
  console.log(e instanceof TypeError);
  console.log(e instanceof Error);
  // The chain is a real hierarchy, so a SIBLING class must answer false. A model that said `true`
  // to everything would pass the two lines above and still be useless for routing.
  console.log(e instanceof RangeError);
  console.log(typeof e);
}

// The same error reaching an outer scope through a rethrow keeps its identity.
function rethrow() {
  try {
    frozen.a = 3;
  } catch (e) {
    throw e;
  }
}
try {
  rethrow();
} catch (e) {
  console.log(e.name + ': ' + e.message);
  console.log(e instanceof TypeError);
}

// A thrown non-error is untouched: the model adds a representation, it does not wrap everything.
try {
  throw 'a plain string';
} catch (e) {
  console.log(typeof e);
  console.log(e);
  console.log(e instanceof Error);
}
