// Calls of an object's function-valued field (plan.md §11c T11.4, plan-notes 310), against Node:
// arrows, function expressions and shorthand function declarations stored in an object literal,
// the receiver a plain `function` sees as `this`, argument evaluation order, nested receivers,
// and a field call whose object was rebuilt.

/** @param {string} text */
function createScanner(text) {
  let pos = 0;
  function scan() {
    pos++;
    return pos < text.length ? text.charAt(pos) : "";
  }
  const getPos = () => pos;
  return {
    scan,
    getPos,
    getText: () => text,
    reset: function () {
      pos = 0;
    },
    /** @param {number} n */
    lookAhead: (n) => text.slice(pos, pos + n),
  };
}

const scanner = createScanner("stator");
scanner.scan();
scanner.scan();
console.log(scanner.getPos(), scanner.lookAhead(3), scanner.getText());
scanner.reset();
console.log(scanner.getPos(), scanner.scan(), scanner.scan() + scanner.scan());

function label() {
  return this.name + "#" + this.id;
}
const item = { name: "item", id: 7, label, shout: function () { return this.name + "!"; } };
console.log(item.label(), item.shout());

const order = [];
const ops = {
  add: (a, b) => a + b,
  note: (x) => {
    order.push(x);
    return x;
  },
};
console.log(ops.add(ops.note(1), ops.note(2)), order.join(","));

const outer = { inner: { twice: (x) => x * 2 } };
console.log(outer.inner.twice(21));

let host = { run: (k) => k * 2 };
console.log(host.run(5));
host = { run: (k) => k * 3 };
console.log(host.run(5));

const counters = [makeCounter(), makeCounter()];
function makeCounter() {
  let n = 0;
  return { inc: () => ++n, get: () => n };
}
counters[0].inc();
counters[0].inc();
counters[1].inc();
console.log(counters[0].get(), counters[1].get());
