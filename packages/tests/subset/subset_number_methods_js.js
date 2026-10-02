// @mode: js
// @verdict: static
// SUBSET.md: Number methods

// The same calls in js mode, including the argument-less forms.
const n = 255;
export const oct = n.toString(8);
export const dec = n.toString();
export const whole = (n / 7).toFixed();
export const i = Number.parseInt('12px');
export const f = Number.parseFloat('.5');
export const tiny = Number.EPSILON;
