// plan.md §8 step 45: dynamic method dispatch through Unknown -- a shape-table read of a
// method NAME missed to `undefined` (object-literal methods ride hidden `#method:` slots,
// class methods ride the descriptor table) and the call aborted STA2006 where Node runs.
// The dynamic get now finds both, and `dyn-method-call` passes the receiver exactly when
// the loaded closure declares `has_receiver`. Nullish still throws Node's catchable TypeError.

function readM(o) {
  console.log(typeof o.m);
}
readM({ m() { return 42; } });

function callM(o) {
  console.log(o.m());
}
callM({ m() { return 42; } });

// `this` is the receiver, not `undefined`.
function callThis(o) {
  console.log(o.m());
}
const thisBox = { x: 10, m() { return this.x + 1; } };
callThis(thisBox);

// A capturing literal method keeps its construction-site environment through the hidden slot.
function makeCounter(n) {
  return {
    get() {
      return n + 1;
    },
  };
}
function callGet(o) {
  console.log(o.get());
}
callGet(makeCounter(41));

class Box {
  constructor() {
    this.v = 5;
  }
  add(a) {
    return this.v + a;
  }
}
function readBox(o) {
  console.log(typeof o.add);
}
readBox(new Box());
function callBox(o) {
  console.log(o.add(3));
}
callBox(new Box());

// Inherited methods resolve through the descendant's own table.
class Base {
  greet() {
    return "hi";
  }
}
class Child extends Base {}
class Loud extends Base {
  greet() {
    return "yo";
  }
}
function callGreet(o) {
  console.log(o.greet());
}
callGreet(new Child());
callGreet(new Loud());
function readGreet(o) {
  console.log(typeof o.greet);
}
readGreet(new Child());

// Optional chains guard nullish and dispatch dynamically otherwise.
function optRead(o) {
  console.log(o?.m);
}
optRead({ m() { return 1; } });
optRead(null);
optRead(undefined);
function optCall(o) {
  console.log(o?.m?.());
}
optCall({ m() { return 9; } });
optCall(null);
optCall(undefined);

// A nullish receiver throws Node's catchable TypeError, byte-for-byte.
function readNullish(o) {
  try {
    console.log(o.m);
  } catch (e) {
    console.log(e.name);
    console.log(e.message);
  }
}
readNullish(null);
readNullish(undefined);
function callNullish(o) {
  try {
    console.log(o.m());
  } catch (e) {
    console.log(e.name);
    console.log(e.message);
  }
}
callNullish(null);
callNullish(undefined);
