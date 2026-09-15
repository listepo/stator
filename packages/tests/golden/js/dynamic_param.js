// A fixed-shape parameter receiving a dynamic value goes dynamic (plan.md §8 step 44c):
// the checker no longer refuses the flow in js mode and no tag check can settle a layout, so
// the parameter widens to Unknown and the body reads through the shape table. A statically
// shape-safe value keeps its slots, and a nullish value throws Node's catchable TypeError
// instead of faulting.

/** @param {{x: number}} o */
function getX(o) {
  return o.x;
}
console.log(getX({ x: 1 }));
console.log(getX(JSON.parse('{"x": 42}')));
console.log(getX(5));

class C {
  constructor() {
    this.x = 3;
  }
}
/** @param {C} c */
function getCX(c) {
  return c.x;
}
console.log(getCX(JSON.parse('{"x": 9}')));

try {
  console.log(getX(null));
} catch (e) {
  console.log("threw " + e.name);
}

// `new` maps its arguments onto the constructor's parameters the same way.
class P {
  /** @param {{x: number}} o */
  constructor(o) {
    this.v = o.x;
  }
}
console.log(new P(JSON.parse('{"x": 11}')).v);
