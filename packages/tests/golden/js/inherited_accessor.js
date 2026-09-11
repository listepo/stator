// An inherited accessor reached through a class that OVERRIDES something else (plan-notes 213).
//
// The class table exists only where something is overridden, and it is built from the type's whole
// method list -- inherited entries included. An accessor is a method under a mangled name
// (`get value`), so resolving "which class implements this entry" used to walk method declarations
// only, answer `undefined`, and fall back to the subclass, whose own body never declared the
// accessor. The emitter then threw STA4072 on a program Node runs happily. What this fixture pins
// is the whole path: a getter and a setter declared in the base, a method overridden in the middle
// of the chain (which is what forces the table), and reads and writes of the accessor from every
// level.

class Base {
  constructor(start) {
    this.n = start;
  }
  get value() {
    return this.n;
  }
  set value(v) {
    this.n = v;
  }
  describe() {
    return `Base(${this.n})`;
  }
}

class Middle extends Base {
  describe() {
    return `Middle(${this.n})`;
  }
}

class Leaf extends Middle {
  describe() {
    return `Leaf(${this.n})`;
  }
}

const leaf = new Leaf(3);
console.log(leaf.value);
console.log(leaf.describe());

// The inherited setter writes the base field through the same table.
leaf.value = 40;
console.log(leaf.value);
console.log(leaf.n);
console.log(leaf.describe());

// A base-typed reference to the same object resolves the same accessor.
const base = leaf;
console.log(base.value);
console.log(base.describe());

// Each level keeps its own answer, and the accessor is still the base's one function.
const middle = new Middle(5);
console.log(middle.value);
console.log(middle.describe());
console.log(leaf instanceof Middle);
console.log(middle instanceof Leaf);
