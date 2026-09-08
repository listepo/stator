// Number formatting is where byte-for-byte equality with Node is hardest to reach: the
// decimal/exponential threshold is 1e21, negative exponents are unpadded, and the digits must be
// the shortest that round-trip. Each line below breaks a naive printf("%g") implementation.
console.log(0.1 + 0.2);
console.log(1 / 3);
console.log(100);
console.log(1e20);
console.log(1e21);
console.log(0.000001);
console.log(1e-7);
console.log(1 / 0);
console.log(-1 / 0);
console.log(0 / 0);
console.log(2147483647 + 1);
console.log(9007199254740993);
