// The ts-mode twin of `js/inherited_accessor.js` (plan-notes 213): the same program with the types
// the mode demands, so the defect cannot hide behind the dynamic path. `override` on the two
// `describe` methods is what forces the class table to exist at all -- and the inherited accessor
// is what the table used to lose, because its mangled HIR name (`get value`) matches no method
// declaration in the subclass the emitter was pointed at.

class Base {
  n: number;
  constructor(start: number) {
    this.n = start;
  }
  get value(): number {
    return this.n;
  }
  set value(v: number) {
    this.n = v;
  }
  describe(): string {
    return `Base(${this.n})`;
  }
}

class Middle extends Base {
  override describe(): string {
    return `Middle(${this.n})`;
  }
}

class Leaf extends Middle {
  override describe(): string {
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
const base: Base = leaf;
console.log(base.value);
console.log(base.describe());

// Each level keeps its own answer, and the accessor is still the base's one function.
const middle = new Middle(5);
console.log(middle.value);
console.log(middle.describe());
console.log(leaf instanceof Middle);
console.log(middle instanceof Leaf);
