// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: object literals
// exactOptionalPropertyTypes is ON in both modes and stays a real refusal here: `undefined` for a
// `value?: string` slot is the mistake the flag exists to catch. js mode gets the same source and
// runs it (subset_optional_undefined_js.js) -- plan.md §8 step 2a(b).
const present: { value?: string } = { value: undefined };
const slot: { value?: string } = { value: 'a' };
slot.value = undefined;
console.log(present.value);
console.log(slot.value);
