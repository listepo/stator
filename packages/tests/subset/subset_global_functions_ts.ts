// @mode: ts
// @verdict: static
// SUBSET.md: Global functions

// The global conversions and number functions called by name (plan.md §11c T11.4): each lowers
// to one node, never to a read of the global object.
const n: number = 42;
export const s = String(n);
export const m = Number('12');
export const b = Boolean(n);
export const i = parseInt('ff', 16);
export const f = parseFloat('3.5e2px');
export const nan = isNaN(n);
export const fin = isFinite(n);
export const none = String();
