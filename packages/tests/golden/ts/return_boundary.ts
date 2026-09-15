// The ts-mode twin of `js/return_boundary.js` (plan.md §8 step 45): `JSON.parse` answers
// `any`, which ts mode trusts at the boundary, so a dynamic value reaches the same fixed
// returns here and the same call-widening answers. Cases ts mode refuses outright (null or a
// mistyped value where an object is declared) cannot be goldens — the build stops — and are
// pinned by `subset_return_boundary_ts` instead.

function f(): { x: number } { return JSON.parse('{"x":1}'); }
console.log(f().x);

function reordered(): { x: number; y: number } { return JSON.parse('{"y":1,"x":2}'); }
console.log(reordered().x);
console.log(reordered().y);

function nums(): number[] { return JSON.parse('[1,2,3]'); }
console.log(nums()[0]);
console.log(nums().length);
console.log(nums().join("|"));

function objs(): { x: number; y: number }[] {
  return JSON.parse('[{"y":1,"x":2},{"y":3,"x":4}]');
}
for (const o of objs()) { console.log(o.x); }
console.log(objs().length);

function g(): { x: number } { return f(); }
function h(): { x: number } { return g(); }
console.log(h().x);
console.log(g().x);

function clean(): { x: number } { return { x: 41 }; }
console.log(clean().x);

const af = (): { x: number } => JSON.parse('{"x":7}');
console.log(af().x);

class C {
  x: number = 3;
  getX(): number { return this.x; }
}
function makeC(): C { return new C(); }
console.log(makeC().x);
console.log(makeC().getX());
