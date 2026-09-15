// plan.md §8 step-2a(b): dynamic `this` in plain functions — ESM is strict, so a bare call
// answers `undefined`; the call site passes its receiver or nothing (docs/VALUE.md §4.16
// `has_receiver`, reused — no second receiver protocol).
function typeofThis() {
  return typeof this;
}
console.log(typeofThis());

function isUndef() {
  return this === undefined ? "undef" : "other";
}
console.log(isUndef());

function arrowThis() {
  const inner = () => typeof this;
  return inner();
}
console.log(arrowThis());

function readX() {
  return this.x;
}
try {
  readX();
} catch (e) {
  console.log(e instanceof TypeError ? "TypeError" : "other");
}

// A plain closure stored on a dynamic object receives the call-site receiver through the
// shape table (`dyn-method-call` passes it exactly when the closure declares `has_receiver`).
function getV() {
  return this.v;
}
const box = {};
box.get = getV;
box.v = 5;
console.log(box.get());
