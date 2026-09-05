// A COMMENT cannot refuse a program. TS8024/8029 reject a function because its JSDoc `@param`
// names a parameter the signature does not have; the parameter list is the code and the tag is
// metadata, so js mode drops the refusal (plan.md §8 step 2a, plan-notes 194).
/** @param {number} q a name no parameter has */
function twice(n) {
  return n * 2;
}
console.log(twice(3));

/** @param {number} a
 *  @param {number} bee the second one is misspelled
 */
function add(a, b) {
  return a + b;
}
console.log(add(2, 5));

// The tag is metadata in the other direction too: it does not constrain what actually flows.
/** @param {number} n */
function shout(n) {
  return n + '!';
}
console.log(shout('hi'));
