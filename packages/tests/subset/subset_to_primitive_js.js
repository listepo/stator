// @mode: js
// @verdict: dynamic
// SUBSET.md: User toString / valueOf
// The js-mode twin: whatever the value turns out to be, the runtime asks it for toString or
// valueOf by name, so a class method, an object literal's method and a constructor's prototype
// method all answer (plan.md §9 Task 6.27).

function Temp(degrees) {
  this.degrees = degrees;
}
Temp.prototype.toString = function () {
  return `${this.degrees}C`;
};
const literal = {
  toString() {
    return 'lit';
  },
};
export const text = `${new Temp(3)}` + String(literal) + ('' + literal) + Number(new Temp(4));
