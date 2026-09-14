// Computed object-literal keys of non-literal type are runtime values (plan.md §8 step 22):
// the literal builds a dynamic object, methods are own data properties holding the method's
// closure, accessors are pairs in their slots, and every site resolves through the shape table.

function base(k) {
  const o = { [k]: 1 };
  console.log(o[k]);
  console.log(typeof o[k]);
}
base("dyn");

function method(k) {
  const o = { x: 10, [k]: 2, m(a) { return this.x + a; } };
  console.log(o.m(5));
  console.log(typeof o.m);
  console.log(o[k]);
  console.log(o.x);
}
method("dyn");

let backing = 0;
function accessor(k) {
  const o = {
    [k]: 2,
    get g() { return backing + 1; },
    set g(v) { backing = v; },
  };
  console.log(o.g);
  o.g = 41;
  console.log(o.g);
  console.log(o[k]);
}
accessor("dyn");

// A method between two values keeps its written position in the enumeration order.
function order(k) {
  const o = { a: 1, [k]: 2, m() { return this.a + 100; }, b: 3 };
  console.log(o.m());
  console.log(Object.keys(o).join(","));
  console.log(JSON.stringify(o));
}
order("dyn");

// A method and an accessor on one dynamic object.
function both(k) {
  const o = { [k]: 2, m() { return 7; }, get g() { return 8; } };
  console.log(o.m());
  console.log(o.g);
  console.log(typeof o.m);
}
both("dyn");
