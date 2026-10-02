// @mode: ts
// @verdict: static
// SUBSET.md: `WeakMap` and `WeakSet`

class Key {}
const k = new Key();
const wm = new WeakMap<Key, number>();
const ws = new WeakSet<Key>();
wm.set(k, 1);
ws.add(k);
console.log(wm.has(k), ws.has(k), wm.delete(k), wm.has(k), wm instanceof WeakMap);
