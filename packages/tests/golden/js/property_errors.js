// Nullish/property-accessor failures must unwind before a later operand or getter runs.
function identity(value) {
  return value;
}
function right() {
  console.log('right ran');
  return 1;
}
function key() {
  console.log('key ran');
  return 'x';
}
const value = identity(undefined);
const nil = identity(null);
try {
  console.log(nil.x);
} catch (e) {
  console.log(e.name);
  console.log(e.message);
}
try {
  nil.x = 1;
} catch (e) {
  console.log(e.message);
}
const primitive = identity(1);
try {
  primitive.x = 1;
} catch (e) {
  console.log(e.name);
  console.log(e instanceof TypeError);
}
try {
  console.log(value.x + right());
} catch (e) {
  console.log(e.name);
  console.log(e.message);
}
try {
  console.log(value[key()] + right());
} catch (e) {
  console.log(e.message);
}
try {
  value[key()] = right();
} catch (e) {
  console.log(e.message);
}
try {
  value.x = right();
} catch (e) {
  console.log(e.message);
}
try {
  value[key()] += right();
} catch (e) {
  console.log(e.message);
}

const accessor = {
  get first() {
    console.log('getter ran');
    throw new Error('getter failed');
  },
  get second() {
    console.log('unreachable getter');
    return 2;
  },
};
try {
  console.log(identity(accessor.first) + right());
} catch (e) {
  console.log(e.message);
}
try {
  console.log(Object.values(accessor));
} catch (e) {
  console.log(e.message);
}
try {
  console.log(Object.entries(accessor));
} catch (e) {
  console.log(e.message);
} finally {
  console.log('finally ran');
}

// Reads through a warmed inline cache must honor a throwing getter as well.
const box = {
  fail: false,
  get x() {
    if (this.fail) {
      throw new Error('cached getter failed');
    }
    return 7;
  },
};
function read(o) {
  return o.x;
}
console.log(read(box));
box.fail = true;
try {
  console.log(read(box));
} catch (e) {
  console.log(e.message);
}
try {
  box.x += right();
} catch (e) {
  console.log(e.message);
}
try {
  console.log(JSON.stringify(box));
} catch (e) {
  console.log(e.message);
}
try {
  console.log(JSON.stringify([box, box]));
} catch (e) {
  console.log(e.message);
}
try {
  console.table(box);
} catch (e) {
  console.log(e.message);
}
try {
  console.log(console.table([box]));
} catch (e) {
  console.log(e.message);
}
const nested = {
  first: box,
  get later() {
    console.log('unreachable nested getter');
    return box;
  },
};
try {
  console.log(JSON.stringify(nested));
} catch (e) {
  console.log(e.message);
}
try {
  console.table(nested);
} catch (e) {
  console.log(e.message);
}

const target = {
  first: 0,
  get anchor() {
    return 0;
  },
};
const source = {
  first: 1,
  get second() {
    console.log('assign getter');
    throw new Error('assign failed');
  },
};
try {
  Object.assign(target, source);
  console.log('unreachable assign');
} catch (e) {
  console.log(e.message);
}
console.log(target.first);

const setterTarget = {
  set first(v) {
    console.log(v);
    throw new Error('setter failed');
  },
};
try {
  Object.assign(setterTarget, source);
} catch (e) {
  console.log(e.message);
}
