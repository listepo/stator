// A closure created at MODULE scope that captures a loop-body binding. Each iteration gets its
// own binding in JavaScript, so the three closures must report three values -- a module env, not
// the one global slot the name would otherwise get (plan.md §8 step 13).
const bodyBound = [];
for (let i = 0; i < 3; i++) {
  const captured = i * 10;
  bodyBound.push(() => captured);
}
bodyBound.forEach((f) => console.log(f()));

// The loop VARIABLE itself is per-iteration too, and the increment applies to the fresh copy.
const headerBound = [];
for (let i = 0; i < 3; i++) {
  headerBound.push(() => i);
}
headerBound.forEach((f) => console.log(f()));

// A write after the closure is built is visible through it: the closure holds the BINDING, not a
// copy taken when it was created.
const mutated = [];
for (let i = 0; i < 3; i++) {
  let c = i;
  const f = () => c;
  c = c + 100;
  mutated.push(f);
}
mutated.forEach((f) => console.log(f()));

// `var` is function-scoped even spelled inside a loop: one binding, shared, left at the value that
// ended the loop. The globals array already implements exactly that, so it must NOT move.
const shared = [];
for (var v = 0; v < 3; v++) {
  shared.push(() => v);
}
shared.forEach((f) => console.log(f()));

// Nested top-level loops: each level contributes its own per-iteration binding.
const nested = [];
for (const a of [1, 2]) {
  for (let b = 0; b < 2; b++) {
    nested.push(() => a * 10 + b);
  }
}
nested.forEach((f) => console.log(f()));

// A module-level binding declared OUTSIDE the loop is still one binding for the life of the
// program, read here through the same closures that capture per-iteration ones.
const scale = 2;
const mixed = [];
for (let i = 0; i < 2; i++) {
  mixed.push(() => i * scale);
}
mixed.forEach((f) => console.log(f()));
