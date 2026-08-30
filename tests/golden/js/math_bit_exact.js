// clz32/imul/fround in js mode -- the bit-exact Math members.

console.log(Math.clz32(-1));
console.log(Math.imul(0xffffffff, 5));
console.log(Math.imul(65536, 65536));
console.log(Math.fround(5.05));
console.log(Math.fround(-0));
