const m = new Map();
m.set('a', 1);
m.set('b', 2);
for (const e of m) {
  console.log(e);
}

const empty = new Map();
for (const e of empty) {
  console.log(e);
}

const live = new Map();
live.set('a', 1);
live.set('b', 2);
let n = 0;
for (const e of live) {
  console.log(e);
  n += 1;
  if (n === 1) {
    live.set('c', 3);
    live.delete('b');
  }
}

const once = new Map();
once.set('x', 9);
once.set('y', 8);
function first() {
  for (const e of once) {
    console.log(e);
    return;
  }
}
first();
for (const e of once) {
  console.log(e);
}
