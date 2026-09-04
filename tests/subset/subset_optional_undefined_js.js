// @mode: js
// @verdict: dynamic
// SUBSET.md: object literals
// The same source js mode accepts: `undefined` is a permitted value for an optional property in
// JavaScript, and an optional property lowers to the dynamic path (plan.md §8 step 2a(b)).
/** @type {{ value?: string }} */
const present = { value: undefined };
/** @type {{ value?: string }} */
const slot = { value: 'a' };
slot.value = undefined;
console.log(present.value);
console.log(slot.value);
