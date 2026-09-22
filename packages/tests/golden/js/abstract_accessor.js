// The js twin of `ts/abstract_accessor.ts` minus what JavaScript cannot spell: `abstract`
// cannot appear in a .js file, so this is the override half of that program. Each half of an
// overridden accessor dispatches on the receiver's runtime class -- through a JSDoc-typed
// base reference and an inherited method alike (plan.md §8 step 12(d)). The pair must stay
// whole across an override: get-only over get-only, set-only over set-only, pair over pair.
class Meter {
  constructor() {
    this.raw = 0;
  }
  get value() {
    return this.raw;
  }
  set value(v) {
    this.raw = v * 2;
  }
  read() {
    return this.value;
  }
  write(v) {
    this.value = v;
  }
}
// A middle class re-declaring nothing: the pair is inherited through it.
class Middle extends Meter {}
class Counter extends Middle {
  constructor(offset) {
    super();
    this.offset = offset;
  }
  get value() {
    return this.raw + this.offset;
  }
  set value(v) {
    this.raw = v * 2;
  }
}
class Negate extends Meter {
  get value() {
    return 0 - this.raw;
  }
  set value(v) {
    this.raw = v + 1;
  }
}

// A get-only pair: an inherited getter and a further override.
class Tag {
  get name() {
    return 'tag';
  }
}
class FancyTag extends Tag {
  get name() {
    return 'fancy';
  }
}

// A set-only pair: writes dispatch to the runtime class's setter, including from an
// inherited method whose `this.push` runs through the same table.
class Sink {
  constructor() {
    this.total = 0;
  }
  set push(v) {
    this.total += v;
  }
  add(v) {
    this.push = v;
  }
}
class DoubleAcc extends Sink {
  set push(v) {
    this.total += v * 2;
  }
}
class Acc extends Sink {
  set push(v) {
    this.total += v;
  }
}

/** @param {Meter} m */
function readValue(m) {
  return m.value;
}
/** @param {Meter} m @param {number} v */
function writeValue(m, v) {
  m.value = v;
}
/** @param {Middle} m */
function readMiddle(m) {
  return m.value;
}

const c = new Counter(10);
console.log(c.value);
c.value = 5;
console.log(c.value);
console.log(readValue(c));
writeValue(c, 7);
console.log(c.read());
console.log(c.value);
console.log(readMiddle(new Counter(1)));
const n = new Negate();
console.log(n.value);
n.value = 4;
console.log(n.read());

console.log(new FancyTag().name);
console.log(new Tag().name);

const s = new DoubleAcc();
s.push = 3;
s.add(2);
console.log(s.total);
const acc = new Acc();
acc.push = 3;
acc.add(2);
console.log(acc.total);
