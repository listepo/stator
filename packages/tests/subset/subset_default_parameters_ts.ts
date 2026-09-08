// @mode: ts
// @verdict: static
// SUBSET.md: Default parameter values

function greet(name: string = "world"): string {
  return name;
}
export { greet };
