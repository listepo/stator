// @mode: js
// @verdict: static
// SUBSET.md: try/catch/finally/throw

// Mirrors the ts fixture: literal-initialized bindings infer fully even in js mode, so the file
// stays static -- what differs by mode here is policy, not this construct.
let out = "";
try {
  throw "boom";
} catch {
  out = `${out}caught`;
} finally {
  out = `${out}!`;
}
console.log(out);
