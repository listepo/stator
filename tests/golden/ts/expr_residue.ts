// Phase 5 step 12 family (b): expression-position residue vs Node, byte-for-byte.
// Labels on a block, per-iteration loop capture, builtin instanceof, field/value updates,
// `**` / `void` / comma / ternary / `in` / for-in.

let labelled: number = 0;
done: {
  labelled = 1;
  break done;
  labelled = 2;
}
console.log(labelled);

function captured(): void {
  const fns: (() => number)[] = [];
  for (let i: number = 0; i < 3; i++) {
    fns.push(() => i);
  }
  for (const f of fns) {
    console.log(f());
  }
}
captured();

console.log([] instanceof Array);
console.log({ x: 1 } instanceof Object);
console.log((() => 1) instanceof Function);

const o: { x: number } = { x: 1 };
o.x = 2;
console.log(o.x);
o.x += 3;
console.log(o.x);
console.log(o.x++);
console.log(o.x);

let n: number = 1;
console.log(n++);
console.log(++n);
console.log((n += 2));

console.log(2 ** 3);
console.log(void 0);

let c: number = 0;
console.log((c = 1, c + 1));
console.log(true ? 1 : 2);
console.log(false ? 1 : 2);

const obj: { a: number; b: number } = { a: 1, b: 2 };
console.log("a" in obj);
console.log("z" in obj);
for (const key in obj) {
  console.log(key);
}
