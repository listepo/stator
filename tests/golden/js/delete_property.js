// `delete` on the dynamic path (plan.md §8 step 2a(c)). The receiver is a dynamic shape or an
// Unknown, so the key lives in the shape table and can leave it: the answer is Node's boolean, the
// next read is `undefined`, `in`/keys/print no longer show it, and a re-add lands LAST -- the shape
// is rebuilt from the survivors in insertion order, not patched. The refusals are the ones §13.5.1
// spells out for strict code: a nullish receiver and a frozen object throw a TypeError.
//
// Every object handed to `drop` is built DYNAMIC (a JSDoc shape with optional keys, or `{}`): a
// fixed-layout literal reaching an Unknown site by structural aliasing cannot lose a slot and
// aborts with STA2004, the same honesty clause docs/SUBSET.md states for growing one.

/** @type {{ a?: number, b?: number, c?: number }} */
const o = { a: 1, b: 2, c: 3 };
console.log(delete o.b);
console.log(o.b);
console.log('b' in o);
console.log(Object.keys(o));
console.log(o);
o.b = 20;
console.log(Object.keys(o));
console.log(o);
console.log(delete o.b);
console.log(delete o.b);
const k = 'c';
console.log(delete o[k]);
console.log(o);

function drop(target, key) {
  try {
    return delete target[key];
  } catch (e) {
    return e instanceof TypeError ? `TypeError: ${e.message}` : 'other';
  }
}
console.log(drop({}, 'x'));
console.log(drop(o, 'zzz'));
console.log(drop(o, 'a'));
console.log(o);
console.log(drop(null, 'x'));
console.log(drop(undefined, 'x'));

/** @type {{ a?: number }} */
const ice = { a: 1 };
Object.freeze(ice);
console.log(drop(ice, 'a'));
console.log(drop(ice, 'nope'));
console.log(ice);
console.log(drop('abc', 'length'));
console.log(drop('abc', 'x'));

/** @type {{ only?: number }} */
const solo = { only: 1 };
console.log(drop(solo, 'only'));
console.log(solo);
solo.only = 2;
console.log(solo);
