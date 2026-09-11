// The ts-mode twin of `js/index_assignment.js` (plan-notes 222).
const o: { n: number; 'a-b': number } = { n: 1, 'a-b': 2 };
o['n'] = 5;
console.log(o.n);
o['a-b'] = 7;
console.log(o['a-b']);
o['n'] += 1;
console.log(o.n);
o['n']++;
console.log(o.n);
