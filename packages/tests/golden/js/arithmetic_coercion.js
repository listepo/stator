// Arithmetic over statically-known primitives (plan.md §8 step 37): js mode suppresses
// the checker's TS2362/TS2363, so the operands reach lowering, where the emitter's
// jsrt_to_number coerces them exactly as Node does. The compound forms assign the number
// result back through the widened binding.
const s = "5";
console.log(s * 1);
console.log(10 - s);
console.log(s / "2");
console.log("2" ** 3);
const b = true;
console.log(b * 2);
const n = null;
console.log(n * 2);
const u = undefined;
console.log(u * 1);

let m = "5";
m *= 2;
console.log(m);
let d = "20";
d -= 1;
console.log(d);
let p = "5";
p **= 2;
console.log(p);
let w = "5";
w = w * 2;
console.log(w);
