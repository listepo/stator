// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: JSON.parse() boundary

export function parse(s) {
  const data = JSON.parse(s);
  return data.x;
}
