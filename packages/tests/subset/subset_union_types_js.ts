// @mode: js
// @verdict: dynamic
// SUBSET.md: Union types

function describe(v: string | number): string {
  if (typeof v === "string") {
    return `string ${v}`;
  }
  return `number ${v + 0}`;
}

console.log(describe("hi"));
console.log(describe(2));
