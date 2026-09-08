// Suspension inside loop bodies (Phase 5 step 8, plan-notes 153): a yield pops the C frame, so
// the loop state lives in a boxed heap iterator — the same object a stored `arr.values()` drives.
// The sync paths (C-local cursor, map_iter_begin/end) are unchanged.

function* arr(): Generator<number, void, undefined> {
  for (const x of [1, 2, 3]) {
    yield x;
  }
}
for (const v of arr()) {
  console.log(v);
}

// The string walk stays a code-point loop when boxed: a, one surrogate pair, b.
function* str(): Generator<string, void, undefined> {
  for (const c of "a\u{1F600}b") {
    yield c;
  }
}
for (const v of str()) {
  console.log(v);
}

function* mp(): Generator<string, void, undefined> {
  const m = new Map<string, number>();
  m.set("x", 1);
  m.set("y", 2);
  for (const e of m) {
    yield e[0];
  }
}
for (const v of mp()) {
  console.log(v);
}

function* st(): Generator<number, void, undefined> {
  const s = new Set<number>();
  s.add(1);
  s.add(2);
  for (const v of s) {
    yield v * 10;
  }
}
for (const v of st()) {
  console.log(v);
}

// break and return still route correctly out of a suspended loop.
function* brk(): Generator<number, string, undefined> {
  for (const x of [1, 2, 3]) {
    yield x;
    if (x === 2) {
      break;
    }
  }
  return "after-break";
}
for (const v of brk()) {
  console.log(v);
}

function* ret(): Generator<number, string, undefined> {
  for (const x of [1, 2, 3]) {
    yield x;
    if (x === 2) {
      return "out";
    }
  }
  return "end";
}
const r = ret();
console.log(r.next());
console.log(r.next());
console.log(r.next());
console.log(r.next());
