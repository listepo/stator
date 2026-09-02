// js mode: `var` is function-scoped, hoisted, initialized `undefined`.
// Four facts the lowering has to get right (plan.md §8 step 3):
//   - a read before the first write answers `undefined`, not a TDZ trap
//   - a `var` inside a block is visible after it
//   - a second `var` of the same name is an assignment to one slot
//   - a `var` in a `for` header is one shared binding; closures built in the loop
//     all see the value the loop left behind
//   - a `var` that repeats a parameter name is that parameter, not a new slot
//
// The classic `console.log(x); var x = 1` spelling is legal JS and the lowering
// desugars it (see tests/unit/var.test.ts), but checkJs reports it as "used
// before being assigned" (STA0012). The golden therefore writes the equivalent
// form checkJs accepts: `var x;` then a read, then a write.

var x;
console.log(x);
x = 1;
console.log(x);

if (true) {
  var y = 7;
}
console.log(y);

var z = 1;
var z = 2;
console.log(z);

function shadow(x) {
  console.log(x);
  var x;
  x = 2;
  console.log(x);
}
shadow(1);

function loopCapture() {
  var a = function () {
    return 0;
  };
  var b = function () {
    return 0;
  };
  for (var i = 0; i < 2; i++) {
    if (i === 0) {
      a = function () {
        return i;
      };
    } else {
      b = function () {
        return i;
      };
    }
  }
  console.log(a());
  console.log(b());
}
loopCapture();

function before() {
  var w;
  console.log(w);
  w = 3;
  console.log(w);
}
before();
