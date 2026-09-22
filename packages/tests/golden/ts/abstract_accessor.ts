// Abstract accessors: `abstract get`/`abstract set` declare the pair and lower to the
// throw-stub plan-notes 275 established for abstract members; a subclass implementation
// runs, and every half dispatches on the receiver's runtime class -- through a base-typed
// reference, through a middle-class-typed one, and from an inherited method alike (plan.md
// §8 step 12(d), plan-notes 275's model). The pair must stay whole across an override:
// get-only over get-only, set-only over set-only, pair over pair.
abstract class Meter {
  raw: number = 0;
  abstract get value(): number;
  abstract set value(v: number);
  read(): number {
    return this.value;
  }
  write(v: number): void {
    this.value = v;
  }
}
// An abstract middle class that re-declares nothing: the pair is inherited through it.
abstract class Middle extends Meter {}
class Counter extends Middle {
  offset: number = 0;
  constructor(offset: number) {
    super();
    this.offset = offset;
  }
  override get value(): number {
    return this.raw + this.offset;
  }
  override set value(v: number) {
    this.raw = v * 2;
  }
}
class Negate extends Meter {
  override get value(): number {
    return 0 - this.raw;
  }
  override set value(v: number) {
    this.raw = v + 1;
  }
}

// A get-only pair: an abstract getter, its implementation, and a further override.
abstract class Label {
  tag: string = 'L';
  abstract get name(): string;
}
class Tag extends Label {
  get name(): string {
    return `t:${this.tag}`;
  }
}
class FancyTag extends Tag {
  override get name(): string {
    return `f(${this.tag})`;
  }
}

// A set-only pair: writes dispatch to the runtime class's setter, including from an
// inherited method whose `this.push` runs through the same table.
abstract class Sink {
  total: number = 0;
  abstract set push(v: number);
  add(v: number): void {
    this.push = v;
  }
}
class Acc extends Sink {
  set push(v: number) {
    this.total += v;
  }
}
class DoubleAcc extends Acc {
  override set push(v: number) {
    this.total += v * 2;
  }
}

const c = new Counter(10);
console.log(c.value);
c.value = 5;
console.log(c.value);
const m: Meter = c;
console.log(m.value);
m.value = 7;
console.log(m.read());
m.write(3);
console.log(m.value);
const mid: Middle = new Counter(1);
console.log(mid.value);
const n: Meter = new Negate();
console.log(n.value);
n.value = 4;
console.log(n.read());

const l: Label = new FancyTag();
console.log(l.name);
console.log(new Tag().name);

const s: Sink = new DoubleAcc();
s.push = 3;
s.add(2);
console.log(s.total);
const acc: Sink = new Acc();
acc.push = 3;
acc.add(2);
console.log(acc.total);
