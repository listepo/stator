// @mode: ts
// @verdict: dynamic
// SUBSET.md: Object namespace
// The landed form: two arguments, and a TARGET the runtime can grow. An index signature (or an
// optional property) is what routes lookups through the shape table instead of a slot index fixed
// at build time, and growing a slot list after the fact is the thing that cannot be done. The
// verdict follows from that: a growable target IS the dynamic representation, so `assign` is a
// dynamic-path operation in ts mode too -- there is no static form of it to reach.

const target: Record<string, number> = { x: 1 };
export const merged = Object.assign(target, { y: 2 });
