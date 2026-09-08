// @mode: js
// @verdict: dynamic
// SUBSET.md: `async` function declarations and expressions, `await`

async function twice(n) {
  const v = await n;
  return v * 2;
}
export { twice };
