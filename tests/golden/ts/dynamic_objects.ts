// Dynamic objects (Task 4.1): a shape with an optional property has no fixed slot list, so the
// literal is built through the shape table and every access resolves the NAME at run time.

const point: { x?: number; y?: number } = { x: 1 };
console.log(point);
console.log(point.x);
console.log(point.y);

point.y = 2;
point.x = 10;
console.log(point);
console.log(point.y);

const empty: { tag?: string; count?: number } = {};
console.log(empty);
empty.tag = "widget";
empty.count = 3;
console.log(empty);
console.log(empty.tag);

// Nesting: a dynamic object holds any value, including another dynamic object.
const wrap: { inner?: { deep?: number } } = {};
wrap.inner = { deep: 7 };
console.log(wrap);
console.log(wrap.inner);

// Two objects built through the SAME literal shape share the shape chain -- and diverging one of
// them afterward must not disturb the other.
const a: { p?: number; q?: number } = { p: 1 };
const b: { p?: number; q?: number } = { p: 2 };
b.q = 9;
console.log(a);
console.log(b);

// Overwriting an existing property transitions no shape: same key, same slot, new value.
b.p = 20;
console.log(b);
