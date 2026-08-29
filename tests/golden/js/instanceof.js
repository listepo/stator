// `instanceof` on operands ts mode's checker refuses to type: its left operand must be an object
// type there, while the LANGUAGE accepts anything at all and answers false for every primitive.
// The runtime is the same one ts mode links, so this is where that half of the rule is pinned.

class P {
  constructor(v) {
    this.v = v;
  }
}
class Q {
  constructor(v) {
    this.v = v;
  }
}
function id(x) {
  return x;
}

// Every primitive is false, and none of them is an error.
console.log(id(1) instanceof P);
console.log(id('s') instanceof P);
console.log(id(true) instanceof P);
console.log(id(null) instanceof P);
console.log(id(undefined) instanceof P);

// An array and a function are objects, but neither carries a class descriptor.
console.log(id([1, 2]) instanceof P);
console.log(id(id) instanceof P);

// And the cases that are true: descriptor identity, nothing else.
console.log(new P(1) instanceof P);
console.log(new Q(1) instanceof P);
console.log(new P(1) instanceof Q);
