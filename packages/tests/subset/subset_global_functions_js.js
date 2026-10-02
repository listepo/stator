// @mode: js
// @verdict: static
// SUBSET.md: Global functions

// The same calls in js mode, including the argument-less forms.
const n = 42;
export const s = String(n);
export const m = Number('12');
export const b = Boolean(n);
export const i = parseInt('ff', 16);
export const f = parseFloat('3.5e2px');
export const nan = isNaN('x');
export const fin = isFinite('1');
export const zero = Number();
