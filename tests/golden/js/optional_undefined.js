// exactOptionalPropertyTypes refuses `undefined` for an optional property; JavaScript does not, and
// the two spellings are OBSERVABLY different — `{}` has no key, `{ value: undefined }` has one whose
// value is undefined. This fixture pins that difference, not just the reads (plan.md §8 step 2a(b)).
/** @param {{ value?: string, writable?: boolean }} desc */
function describe(desc) {
  console.log(desc.value);
  console.log(desc.writable);
}
describe({ value: undefined, writable: true });

/** @type {{ value?: string }} */
const absent = {};
/** @type {{ value?: string }} */
const present = { value: undefined };
console.log(absent.value);
console.log(present.value);
console.log(Object.keys(absent).length);
console.log(Object.keys(present).length);
console.log(absent);
console.log(present);

/** @type {{ value?: string }} */
const slot = { value: 'a' };
slot.value = undefined;
console.log(slot.value);
console.log(Object.keys(slot).length);
