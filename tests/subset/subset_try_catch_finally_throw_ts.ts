// @mode: ts
// @verdict: static
// SUBSET.md: try/catch/finally/throw

// No function here on purpose: this fixture names `try`, so it must not also depend on functions
// (plan-notes 42). The thrown value is a plain string -- `Error` is a Phase-4 global -- and the
// catch is binding-less, because the binding is typed `unknown` and reading it would make the
// fixture depend on narrowing rather than on the construct it names.
let out: string = "";
try {
  throw "boom";
} catch {
  out = `${out}caught`;
} finally {
  out = `${out}!`;
}
console.log(out);
