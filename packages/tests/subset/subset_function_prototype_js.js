// @mode: js
// @verdict: dynamic
// SUBSET.md: Property of a function value

// `P.prototype.get = …` writes the auto-created prototype object, and an instance finds `get`
// on its chain; `P.count` lives in the function's own property table (plan-notes 310).
function P(x) {
  this.x = x;
}
P.prototype.get = function () {
  return this.x;
};
P.count = 0;
P.count += 1;
console.log(new P(2).get(), P.count);
