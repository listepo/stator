// @mode: ts
// @verdict: error
// @code: STA0012
// Property assignments do not declare their receiver, even when the checker invents a namespace.
try {
  missingNamespace.a = 1;
} catch (e) {
  console.log(e.name);
}
try {
  missingIndex[0] = 1;
} catch (e) {
  console.log(e.name);
}
