// Growing a fixed layout (T11.4 family 7, docs/VALUE.md §4.24): a name an object's type never
// declared lands in the object's overflow table, created on the first such write. Reads of it
// answer what was stored or `undefined`, and every reflective walk lists it after the declared
// names -- which is where Node lists a property added after construction.
function makeFile(name) {
  return { name, size: 0 };
}
const file = makeFile('a.ts');
console.log(file.isClosed);
file.isClosed = true;
console.log(file.isClosed, file.missing);
console.log(file);
console.log(Object.keys(file), JSON.stringify(file));
file.isClosed = false;
console.log(file.isClosed, 'isClosed' in file, Object.hasOwn(file, 'isClosed'));
for (const k in file) console.log(k);
console.log(Object.entries(file), Object.values(file));

// Compound, logical and update forms read the undeclared name, then grow it.
const info = makeFile('b.ts');
info.count ??= 1;
info.count ??= 5;
info.count += 2;
info.count++;
info.label ||= 'first';
info.label &&= info.label + '!';
console.log(info.count, info.label, info);

// A grown function is called with the object as receiver; an absent one throws Node's TypeError.
info.describe = function () {
  return 'file ' + this.name;
};
console.log(info.describe());
try {
  file.describe();
} catch (e) {
  console.log(e.name, e.message);
}

// A class instance grows the same way, and `delete` removes a grown name again.
class Node2 {
  constructor(kind) {
    this.kind = kind;
  }
}
const n = new Node2(3);
n.parent = n.kind * 2;
console.log(n.parent, n);
delete n.parent;
console.log(n, n.parent, 'parent' in n);
try {
  n.visit();
} catch (e) {
  console.log(e.name, e.message);
}
n.visit = function () {
  return this.kind + 10;
};
console.log(n.visit());

// A chain through a grown value reads and writes its members dynamically.
file.meta = { tags: [] };
file.meta.tags.push('x');
file.meta.owner = 'me';
console.log(file.meta, file.meta.tags.length);

// Object spread copies the grown names too, into a dynamic or a fixed result. A fixed result
// lists them after its declared names, so this spells its own key first, where Node puts it too.
const copy = { extra: 1, ...file };
console.log(copy, Object.keys(copy).length);
const loose = { ...file };
console.log(loose.isClosed, loose.meta.owner);

// A frozen object is not extensible: adding throws, as does writing a grown name.
Object.freeze(info);
console.log(Object.isFrozen(info));
try {
  info.more = 1;
} catch (e) {
  console.log(e.name, e.message);
}
try {
  info.count = 1;
} catch (e) {
  console.log(e.name, e.message);
}
console.log(info.count, info.more);

// A computed key on a fixed shape reads and writes by name: the declared slot, the overflow
// table, or `undefined`.
const table = { 1: 'one', 2: 'two', name: 'tbl' };
function kindName(kind) {
  return table[kind];
}
console.log(kindName(1), kindName(2), kindName(3));
const levels = { low: 1, high: 3 };
function setLevel(level, value) {
  levels[level] = value || levels[level];
}
setLevel('low', 2);
setLevel('mid', 5);
setLevel('high', 0);
console.log(levels, levels.mid);
const key = 'name';
console.log(table[key], table['na' + 'me']);
const counts = { a: 0 };
for (const w of ['a', 'b', 'a', 'c']) {
  counts[w] = (counts[w] || 0) + 1;
}
counts.b += 10;
console.log(counts, Object.keys(counts));
