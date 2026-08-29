// @mode: ts
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: JSON.parse() boundary

export function parse(s: string): any {
  const data = JSON.parse(s);
  return data.x;
}
