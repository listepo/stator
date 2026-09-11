// `o["k"] = v` on a FIXED shape (plan-notes 222). The read path already reduced a string-literal
// key to a field access; the write path built an index node, which the verifier rejects on a
// layout -- so `o["n"] = 5` was STA4044 while `(o["n"] += 1)` compiled. A key that is not an
// identifier has no other spelling than this one, so the write is not optional.
const o = { n: 1, 'a-b': 2 };
o['n'] = 5;
console.log(o.n);
console.log(JSON.stringify(o));
o['a-b'] = 7;
console.log(o['a-b']);
console.log(JSON.stringify(o));
o['n'] += 1;
console.log(o.n);
o['n']++;
console.log(o.n);
console.log((o['n'] = 3));
console.log(o.n);
o['n'] *= 2;
console.log(o.n);
