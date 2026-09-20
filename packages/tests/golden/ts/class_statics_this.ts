// Static `this` and `super`: a static callable that reads its receiver is lowered once per class
// that reaches it, so `this.v` names the receiver class's own binding (docs/VALUE.md §4.18).

class S {
  static v = 5;
  static count = 0;
  static get w(): number {
    return this.v + 1;
  }
  static set w(n: number) {
    this.v = n;
  }
  static m(): number {
    return this.v * 2;
  }
  static n(): number {
    return this.m() + S.count;
  }
}

// T re-declares v, so every `this.v` S's statics run for T reads T's binding.
class T extends S {
  static override v = 10;
}

console.log(`${S.w} ${T.w} ${S.m()} ${T.m()} ${S.n()} ${T.n()}`);
T.w = 3;
console.log(`${S.v} ${T.v}`);
S.w = 7;
console.log(`${S.v} ${T.v} ${S.w} ${T.w}`);
S.count = 2;
console.log(`${S.count} ${T.count} ${T.n()}`);

// No own statics: `this.k` for Q2 is the nearest declaration up the chain, Q's.
class P {
  static k = 3;
  static twice(): number {
    return this.k * 2;
  }
}
class Q extends P {
  static override k = 4;
}
class Q2 extends Q {}
console.log(`${P.twice()} ${Q.twice()} ${Q2.twice()} ${Q2.k}`);

// `super.m()` in a static starts the lookup at the base and keeps the receiver.
class B2 {
  static id = 'B2';
  static q = 7;
  static m(): string {
    return `B2:${this.id}q${this.q}`;
  }
}
class D2 extends B2 {
  static override id = 'D2';
  static override m(): string {
    return `D2>${super.m()}`;
  }
}
class E2 extends D2 {
  static override q = 8;
}
console.log(`${B2.m()} ${D2.m()} ${E2.m()}`);

// Static functions exist before any static initializer runs; fields and blocks run in the order
// they are written, and `this` in a block is the class.
class Order {
  static log: string[] = [];
  static total = 0;
  static first = Order.note('first');
  static {
    Order.note('block');
    this.total = Order.log.length;
  }
  static second = Order.note('second');
  static note(s: string): string {
    Order.log.push(s);
    return s;
  }
}
console.log(`${Order.first} ${Order.second} ${Order.total} ${Order.log.join(',')}`);

// A read-only static getter, with a static #private field behind it.
class Counter {
  static #hits = 0;
  static get hits(): number {
    return Counter.#hits;
  }
  static hit(): void {
    Counter.#hits++;
  }
}
Counter.hit();
Counter.hit();
console.log(Counter.hits);
