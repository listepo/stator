// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- a member-expression base (`NS.C`) names one class declaration and the
// heritage rule accepts it, but the namespace itself is a separate not-yet, so the program
// stays not-yet under that verdict (plan.md §8 step 43).

namespace NS {
  export class C {
    constructor() {
      this.x = 1;
    }
  }
}
class D extends NS.C {
  constructor() {
    super();
    this.y = 2;
  }
}
console.log(new D().x);
