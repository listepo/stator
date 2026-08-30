// @mode: ts
// @verdict: static
// SUBSET.md: `async` function declarations and expressions, `await`

async function twice(n: Promise<number>): Promise<number> {
  const v = await n;
  return v * 2;
}
export { twice };
