// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: try/catch/finally/throw

// The same source in ts mode: a thrown value is an unchecked boundary (§0.2, §0.4), so the catch
// binding is `unknown` and must be narrowed before it is read. The js fixture is the other half.
function len(): number {
  try {
    throw "boom";
  } catch (e) {
    return e.length;
  }
}
console.log(len());
