// The ts-mode twin of js/module_loop_capture.js: per-iteration bindings captured at MODULE scope
// are a typed-TypeScript construct, so the default mode carries the same proof (plan.md §8 step
// 13). `var` has no row here -- it is STA1104 in ts mode by design.
const bodyBound: (() => number)[] = [];
for (let i = 0; i < 3; i++) {
  const captured = i * 10;
  bodyBound.push(() => captured);
}
for (const f of bodyBound) {
  console.log(f());
}

const headerBound: (() => number)[] = [];
for (let i = 0; i < 3; i++) {
  headerBound.push(() => i);
}
for (const f of headerBound) {
  console.log(f());
}

// The closure holds the binding, not a snapshot taken when it was built.
const mutated: (() => number)[] = [];
for (let i = 0; i < 3; i++) {
  let c = i;
  const f = (): number => c;
  c = c + 100;
  mutated.push(f);
}
for (const f of mutated) {
  console.log(f());
}

const nested: (() => number)[] = [];
for (const a of [1, 2]) {
  for (let b = 0; b < 2; b++) {
    nested.push(() => a * 10 + b);
  }
}
for (const f of nested) {
  console.log(f());
}

// One binding for the life of the program, read alongside per-iteration ones.
const scale = 2;
const mixed: (() => number)[] = [];
for (let i = 0; i < 2; i++) {
  mixed.push(() => i * scale);
}
for (const f of mixed) {
  console.log(f());
}
