// The ts-mode twin of `js/arrow_this.js` (plan-notes 222): `this` read through an arrow.
class C {
  n: number;
  constructor() {
    this.n = 1;
  }
  direct(): number {
    const f = (): number => this.n + 1;
    return f();
  }
  throughMap(): string {
    return [1, 2].map(() => this.n).join(',');
  }
  get accessor(): number {
    return (() => this.n)();
  }
  nested(): number {
    return (() => (() => this.n)())();
  }
}
const c = new C();
console.log(c.direct());
console.log(c.throughMap());
console.log(c.accessor);
console.log(c.nested());
console.log(c.direct() + 10);
