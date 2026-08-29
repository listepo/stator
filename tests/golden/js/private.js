// #private members on the dynamic path: an uninitialized #private slot reads undefined like any
// other field, and it stays invisible to util.inspect either way.

class Box {
  #value;
  #seen = 0;
  kind = 'box';

  put(v) {
    this.#value = v;
    this.#seen = this.#seen + 1;
    return this.#tally();
  }
  #tally() {
    return `${this.#seen}:${this.#value}`;
  }
  peek() {
    return this.#value;
  }
}

class Hidden {
  #only = 1;
  read() {
    return this.#only;
  }
}

class Tagged extends Box {
  tag = 't';
}

const b = new Box();
console.log(b.peek());
console.log(b);
console.log(b.put('a'));
console.log(b.put(2));
console.log(b.peek());
console.log(b);

const h = new Hidden();
console.log(h.read());
console.log(h);

const t = new Tagged();
console.log(t.put('z'));
console.log(t);
console.log(t.kind);
