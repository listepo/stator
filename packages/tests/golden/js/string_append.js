// `+=` in a loop extends a shared append buffer in js mode too (plan.md §9 Task 6.23, F12).
let s = '';
for (let i = 0; i < 300; i++) s += i % 7;
const t = s + 'A';
const u = s + 'B';
console.log(s.length, t.slice(-2), u.slice(-2), t === u);

const parts = { text: '' };
for (let i = 0; i < 100; i++) parts.text += 'ab';
console.log(parts.text.length, parts.text.slice(0, 6));

let mixed = '';
for (let i = 0; i < 80; i++) mixed = mixed + (i % 2 === 0 ? i : 'z');
console.log(mixed.length, mixed.slice(-6));
