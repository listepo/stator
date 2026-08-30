// at/codePointAt/concat/toString/valueOf in js mode.

const s = 'héllo 𝄞 world';
console.log(s.at(-1));
console.log(s.at(99));
console.log(s.codePointAt(6));
console.log(s.concat('!'));
console.log(s.toString());
console.log(s.valueOf());
