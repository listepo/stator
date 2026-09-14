// String.fromCharCode with any count (plan.md §8 step 19): one UTF-16 unit per argument,
// each ToUint16 of its value, so fractions truncate, negatives and astral codes wrap modulo
// 2^16, and NaN is 0. Zero arguments answer the empty string. JSON.stringify keeps the
// non-printable answers readable.

console.log(String.fromCharCode(65, 66, 67));
console.log(String.fromCharCode(65));
console.log(JSON.stringify(String.fromCharCode()));
console.log(JSON.stringify(String.fromCharCode(65, 0x41 + 0x10000)));
console.log(JSON.stringify(String.fromCharCode(NaN)));
console.log(JSON.stringify(String.fromCharCode(-1)));
console.log(JSON.stringify(String.fromCharCode(65.9)));
