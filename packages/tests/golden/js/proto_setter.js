// `{ __proto__: v }` is the prototype setter, not an own data property (plan.md §8 step
// 33): the key never appears in stringify, keys, values, entries, `in` or the inspector,
// while a computed `["__proto__"]` stays an own data property. The setter value still
// evaluates in written position.

const o = { __proto__: 1, a: 1 };
console.log(JSON.stringify(o));
console.log(JSON.stringify(Object.keys(o)));
console.log(JSON.stringify(Object.values(o)));
console.log(JSON.stringify(Object.entries(o)));
console.log(o);
console.log(Object.hasOwn(o, "__proto__"));
console.log(Object.hasOwn(o, "a"));
console.log("a" in o);
console.log(o.a);

// The quoted spelling is the same setter.
const q = { "__proto__": 2, b: 3 };
console.log(JSON.stringify(q));

// `null` sets a null prototype and likewise creates no own property.
const n = { __proto__: null, d: 6 };
console.log(JSON.stringify(n));
console.log(JSON.stringify(Object.keys(n)));

// The value evaluates in order with the surrounding entries.
const calls = [];
const f = () => {
  calls.push("f");
  return 1;
};
const g = () => {
  calls.push("g");
  return 2;
};
const h = () => {
  calls.push("h");
  return 3;
};
const ordered = { a: f(), __proto__: g(), b: h() };
console.log(JSON.stringify(calls));
console.log(JSON.stringify(ordered));

// A shorthand under the name is an ordinary own property, not the setter.
let __proto__ = 5;
const s = { __proto__ };
console.log(JSON.stringify(s));

// A computed key is an own data property even when it spells `__proto__`.
const c = { ["__proto__"]: 4, e: 5 };
console.log(JSON.stringify(c));
console.log(JSON.stringify(Object.keys(c)));
console.log(Object.hasOwn(c, "__proto__"));

// A runtime-computed key is one too.
function byKey(k) {
  const w = { [k]: 9, a: 1 };
  console.log(JSON.stringify(w));
}
byKey("__proto__");

// `delete` finds no own `__proto__` to remove and answers `true`.
console.log(delete o.a);
console.log(JSON.stringify(o));
