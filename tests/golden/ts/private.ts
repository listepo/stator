// #private members: ordinary slots and bindings, except that util.inspect never prints them.

class Counter {
  #count = 0;
  label: string;

  constructor(label: string) {
    this.label = label;
  }

  // A #private method: dispatched exactly like a public one, just unspellable from outside.
  #step(by: number): number {
    this.#count += by;
    return this.#count;
  }

  bump(): number {
    return this.#step(1);
  }
  jump(): number {
    return this.#step(10);
  }
  read(): number {
    return this.#count;
  }
}

// A class whose every field is #private still prints its name and empty braces.
class Opaque {
  #a: number;
  #b: string;
  constructor(a: number, b: string) {
    this.#a = a;
    this.#b = b;
  }
  describe(): string {
    return `${this.#b}${this.#a}`;
  }
}

// #private statics are bindings like any other static -- and equally invisible.
class Ids {
  static #next = 1;
  static take(): number {
    const id = Ids.#next;
    Ids.#next += 1;
    return id;
  }
}

// A subclass adds public state on top of a base that keeps its own #private slot.
class Named extends Counter {
  tag: string;
  constructor(label: string, tag: string) {
    super(label);
    this.tag = tag;
  }
}

const c = new Counter('c');
console.log(c.bump());
console.log(c.jump());
console.log(c.read());
console.log(c);

const o = new Opaque(7, 'x');
console.log(o.describe());
console.log(o);

console.log(Ids.take());
console.log(Ids.take());

const n = new Named('n', 't');
console.log(n.bump());
console.log(n.read());
console.log(n);
console.log(n.label);
