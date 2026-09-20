// plan.md §8 step 2a(c) (TS2488): `for-of` over a statically-unknown iterable dispatches at
// run time (`jsrt_get_iterator`) -- collections box into their specialized walk, generators and
// stored iterators drive as-is, a user-iterable method is resolved and called, and anything else
// throws Node's catchable TypeError. Throw cases print only the name (and the instanceof pair):
// Node's message names the source text, which compiled code no longer has, so only the
// nullish/number direct spellings below are message-exact.
function each(o) {
  for (const x of o) {
    console.log(x);
  }
}

each([10, 20]);
each('ab');
each('👍x');

const m = new Map();
m.set('k', 1);
m.set('j', 2);
each(m);

const s = new Set();
s.add('p');
s.add('q');
each(s);

function* gen(n) {
  try {
    yield 1;
    yield 2;
  } finally {
    console.log('gen finally');
  }
}
each(gen(2));

class Counter {
  constructor(n) {
    this.n = n;
  }
  [Symbol.iterator]() {
    return gen(this.n);
  }
}
each(new Counter(2));

const stored = [7, 8].values();
each(stored);

function keysOf(o) {
  for (const k of o.keys()) {
    console.log(k);
  }
}
keysOf([5, 6]);

function pick(c) {
  const o = c ? [1, 2] : 'ab';
  for (const x of o) {
    console.log(x);
  }
}
pick(true);
pick(false);

function first(o) {
  for (const x of o) {
    console.log(x);
    break;
  }
  console.log('after break');
}
first(gen(2));
first([1, 2, 3]);

function closed(o) {
  try {
    for (const x of o) {
      throw new Error('boom');
    }
  } catch (e) {
    console.log(e.name);
    console.log(e.message);
  }
}
closed(gen(1));

function collectors(o) {
  const fns = [];
  for (const x of o) {
    fns.push(() => x);
  }
  return fns;
}
const fs = collectors([1, 2, 3]);
console.log(fs[0](), fs[1](), fs[2]());

function find(o, v) {
  for (const x of o) {
    if (x === v) {
      return x;
    }
  }
  return -1;
}
console.log(find([1, 2, 3], 2));
console.log(find([1, 2, 3], 9));

async function asum(o) {
  let total = 0;
  for (const x of o) {
    total = total + (await x);
  }
  return total;
}
console.log(await asum([1, 2, 3]));

function* gcollect(o) {
  for (const x of o) {
    yield x * 2;
  }
}
for (const y of gcollect([1, 2])) {
  console.log(y);
}

function run(o) {
  try {
    for (const x of o) {
      console.log(x);
    }
  } catch (e) {
    console.log(e.name);
    console.log(e instanceof TypeError);
    console.log(e instanceof Error);
  }
}
run(undefined);
run(null);
run(true);
run({ a: 1 });

try {
  for (const x of undefined) {
    console.log('unreachable');
  }
} catch (e) {
  console.log(e.name);
  console.log(e.message);
}

try {
  for (const x of 5) {
    console.log('unreachable');
  }
} catch (e) {
  console.log(e.name);
  console.log(e.message);
}
