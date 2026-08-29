// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: try/catch/finally/throw

function test(shouldThrow: boolean): number {
  try {
    if (shouldThrow) {
      throw new Error("test error");
    }
    return 42;
  } catch (e: unknown) {
    return -1;
  } finally {
    // cleanup
  }
}
export { test };
