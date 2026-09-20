// Static `this` and `super` in js mode: the same per-receiver lowering as ts mode, and a static
// with only a setter reads `undefined` (docs/VALUE.md §4.18).

class S {
  static v = 5;
  static get w() {
    return this.v + 1;
  }
  static set w(n) {
    this.v = n;
  }
  static set only(n) {
    this.v = n;
  }
  static m() {
    return this.v * 2;
  }
}

class T extends S {
  static v = 10;
}

// Inside a function: a top-level `T.w = n` in a .js file is also a TypeScript expando declaration.
function write(n) {
  T.w = n;
  S.only = n + 1;
}

console.log(`${S.w} ${T.w} ${S.m()} ${T.m()}`);
write(3);
console.log(`${S.v} ${T.v} ${S.only} ${T.only}`);

class B2 {
  static id = 'B2';
  static q = 7;
  static m() {
    return `B2:${this.id}q${this.q}`;
  }
}
class D2 extends B2 {
  static id = 'D2';
  static m() {
    return `D2>${super.m()}`;
  }
}
console.log(D2.m());

class Order {
  static first = Order.note('first');
  static {
    Order.note('block');
  }
  static second = Order.note('second');
  static note(s) {
    console.log(s);
    return s;
  }
}
console.log(`${Order.first} ${Order.second}`);
