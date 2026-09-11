// The `in` operator (plan-notes 220). Two defects met here: the runtime answered `true` for
// `'length' in 'abc'` and `false` for every other primitive where the spec THROWS (the right
// operand must be an object), and a string key that is not a canonical index ('01', '+1', '-0')
// was accepted by `strtoul` as one. Both are observable below, and the TypeError is caught inside
// a try/catch -- which is also the regression proof for the emitter's dropped-catch bug: `in`
// raised without a pending check, so `emitTryCatch` saw no jump to its pad and deleted the handler.

const a = [1, 2, 3];
console.log('0' in a);
console.log('2' in a);
console.log('3' in a);
console.log('01' in a);
console.log('+1' in a);
console.log('-0' in a);
console.log('length' in a);

const o = { p: 1 };
console.log('p' in o);
console.log('q' in o);

const key = 'p';
console.log(key in o);

// A dynamic object, so a key added and removed at run time is visible to `in` as well.
/** @type {{ m?: number }} */
const dyn = {};
dyn.m = 1;
console.log('m' in dyn);
delete dyn.m;
console.log('m' in dyn);

// A primitive right operand is a TypeError, and it is CATCHABLE -- the try block is the reason
// this fixture exists.
try {
  console.log('length' in 'abc');
} catch (e) {
  console.log(`${e.name}: ${e.message}`);
}
try {
  console.log('x' in 42);
} catch (e) {
  console.log(`${e.name}: ${e.message}`);
}
try {
  console.log('x' in true);
} catch (e) {
  console.log(`${e.name}: ${e.message}`);
}

// `in` on an object does not throw, so the catch stays silent.
try {
  console.log('p' in o);
} catch (e) {
  console.log('unreachable');
}
