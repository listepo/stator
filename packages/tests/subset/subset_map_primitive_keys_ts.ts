// @mode: ts
// @verdict: static
// SUBSET.md: Map with primitive keys (string, number, boolean, null, undefined)

// Two spellings that are not interchangeable here. The type arguments are on the CONSTRUCTION, not
// on an annotation: `const m: Map<string, number> = new Map()` types the construction itself
// `Map<any, any>` -- the annotation constrains the binding, and nothing infers K and V for the call
// -- so that spelling is dynamic. And not a `.get`, which reads `V | undefined`: a union the HType
// model has no member for, and so Unknown for a reason that is not about the keys.
const m = new Map<string, number>();
m.set('key', 42);
console.log(m.has('key'));
