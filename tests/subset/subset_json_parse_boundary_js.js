// @mode: js
// @verdict: dynamic
// SUBSET.md: JSON.parse() boundary

export function parse(s) {
  const data = JSON.parse(s);
  return data.x;
}
