// Phase 5 step 12 family (b): expression-position residue vs Node, byte-for-byte.

let labelled = 0;
done: {
  labelled = 1;
  break done;
  labelled = 2;
}
console.log(labelled);

function captured() {
  let f0 = () => 0;
  let f1 = () => 0;
  let f2 = () => 0;
  for (let i = 0; i < 3; i++) {
    if (i === 0) {
      f0 = () => i;
    } else if (i === 1) {
      f1 = () => i;
    } else {
      f2 = () => i;
    }
  }
  console.log(f0());
  console.log(f1());
  console.log(f2());
}
captured();

console.log([] instanceof Array);
console.log({ x: 1 } instanceof Object);
console.log((() => 1) instanceof Function);

const o = { x: 1 };
o.x = 2;
console.log(o.x);
o.x += 3;
console.log(o.x);
console.log(o.x++);
console.log(o.x);

let n = 1;
console.log(n++);
console.log(++n);
console.log((n += 2));

console.log(2 ** 3);
console.log(void 0);

let c = 0;
console.log((c = 1, c + 1));
console.log(true ? 1 : 2);
console.log(false ? 1 : 2);

const obj = { a: 1, b: 2 };
console.log("a" in obj);
console.log("z" in obj);
for (const key in obj) {
  console.log(key);
}
