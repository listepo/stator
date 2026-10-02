// `var`/`let X = class { … }` that nothing repoints lowers like the `const` formation (plan.md
// §11d T12.3): Rolldown spells every top-level class this way.
var P = class {
  constructor(x) {
    this.x = x;
  }
  static make(x) {
    return new P(x);
  }
  get double() {
    return this.x * 2;
  }
};
let Q = class Named extends P {
  show() {
    return 'Q' + this.x;
  }
};
const q = new Q(4);
console.log(P.make(2).double, q.show(), q instanceof P, q instanceof Q);
