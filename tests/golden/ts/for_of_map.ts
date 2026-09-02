// for-of over a Map walks insertion order and yields [key, value] pairs.
const m = new Map<string, number>();
m.set('a', 1);
m.set('b', 2);
for (const e of m) {
  console.log(e);
}

const empty = new Map<string, number>();
for (const e of empty) {
  console.log(e);
}

const live = new Map<string, number>();
live.set('a', 1);
live.set('b', 2);
let n: number = 0;
for (const e of live) {
  console.log(e);
  n += 1;
  if (n === 1) {
    live.set('c', 3);
    live.delete('b');
  }
}

function first(map: Map<string, number>): void {
  for (const e of map) {
    console.log(e);
    return;
  }
}
const once = new Map<string, number>();
once.set('x', 9);
once.set('y', 8);
first(once);
for (const e of once) {
  console.log(e);
}
