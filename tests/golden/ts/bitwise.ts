// Bitwise operators, checked against Node byte-for-byte. Every value here is one of the traps
// docs/NUMERIC.md §4 names: modular ToInt32 rather than a saturating or undefined C cast, shift
// counts masked to 5 bits, and `>>>` producing a result too large for int32.
console.log(5 & 3);
console.log(5 | 3);
console.log(5 ^ 3);
console.log(~5);

// ToInt32 is modular and truncates toward zero. A C cast here would be undefined behaviour.
console.log(1e21 | 0);
console.log(1e10 | 0);
console.log(2147483648 | 0);
console.log(4294967296 | 0);
console.log(1 / 3 | 0);
console.log(-1.9 | 0);

// NaN and the infinities all become 0, not an error and not a clamped extreme.
console.log(0 / 0 | 0);
console.log(1 / 0 | 0);
console.log(-1 / 0 | 0);

// Shift counts wrap at 32, so `1 << 32` is 1 and not 0.
console.log(1 << 4);
console.log(1 << 32);
console.log(1 << 31);
console.log(-8 >> 1);
console.log(-8 >> 32);

// The one bitwise operator whose result can exceed int32 range.
console.log(-1 >>> 0);
console.log(-8 >>> 1);
console.log(4294967295 >>> 0);
