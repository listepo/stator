// String.fromCharCode in js mode (plan.md §8 step 19), including the string argument the
// ts checker refuses: each code goes through ToNumber first, so "66" is 66.

console.log(String.fromCharCode(65, 66, 67));
console.log(String.fromCharCode(65));
console.log(JSON.stringify(String.fromCharCode()));
console.log(JSON.stringify(String.fromCharCode(65, 0x41 + 0x10000)));
console.log(JSON.stringify(String.fromCharCode(NaN)));
console.log(JSON.stringify(String.fromCharCode(-1)));
console.log(JSON.stringify(String.fromCharCode(65.9)));
console.log(JSON.stringify(String.fromCharCode("66")));
