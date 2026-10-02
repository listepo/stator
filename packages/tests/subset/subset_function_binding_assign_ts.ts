// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Assignment to a function declaration's binding
// ts mode keeps tsc's TS2630: reassigning a declared function is the mistake its declared type
// exists to catch. js mode drops it (subset_function_binding_assign_js, plan-notes 297).
function log(): void {}
log = (): void => {};
log();
