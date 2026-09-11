// Inlining declines a body whose nested function REBINDS a parameter being substituted
// (plan-notes 219). The inliner's condition 2 asks whether a body names anything but its own
// parameters; a callback parameter with the same name answers yes and is not one -- the name
// belongs to the callback. Substituting textually turned `shift(7)` into `70` where Node says `10`.
function shift(x: number): number {
  return [1, 2].map(function (x: number): number {
    return x * 10;
  })[0] as number;
}
console.log(shift(7));

// The smaller spelling of the same thing: the inner function's parameter shadows the outer one.
function f(a: number, b: number): number {
  return (function (a: number): number {
    return a * 10;
  })(b);
}
console.log(f(7, 3));

// A body that names ONLY its own parameter still inlines, and the answer is unchanged.
function plain(x: number): number {
  return x + 1;
}
console.log(plain(4));
console.log(plain(4) + plain(4));
