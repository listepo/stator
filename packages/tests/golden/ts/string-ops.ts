// String concatenation, comparison, equality and `.length`, checked against Node byte-for-byte.
//
// Two of these were confirmed WRONG before rung 2: `'ab' === 'ab'` was false (strings compared by
// pointer, and two identical literals are two allocations) and `'ab' < 'b'` was false (relational
// comparison ran ToNumber on strings and got NaN). Both were silent wrong answers, not errors.
const ab: string = 'ab';
const ab2: string = 'ab';
console.log(ab === ab2);
console.log(ab !== ab2);
console.log(ab == ab2);

// Order is by UTF-16 code unit, not by length and not by locale.
console.log(ab < 'b');
console.log(ab < 'aa');
console.log('' < 'a');
console.log('Z' < 'a');
console.log('abc' <= 'abc');
console.log('abc' >= 'abd');

// `+` concatenates when EITHER operand is a string, and stringifies the other one.
console.log('a' + 'b');
console.log('a' + 1);
console.log(1 + 'a');
console.log('' + 1);
console.log(true + 'x');
console.log('n=' + null);
console.log('u=' + undefined);
console.log('nan=' + 0 / 0);
console.log('inf=' + 1 / 0);
console.log('neg=' + -0);

// `+` on two numbers is still addition, and `+` is left-associative: the first two add, then the
// sum is stringified. This is the classic case a compiler gets wrong by special-casing too early.
console.log(1 + 2 + 'a');
console.log('a' + 1 + 2);

// Relational comparison does NOT follow `+`: it compares as text only when BOTH sides are
// strings, so this is true even though 10 < 9 is false.
console.log('10' < '9');
// The other half of that pair — `'10' < 9`, which is FALSE because a non-string operand forces
// ToNumber on both — cannot be written here: TypeScript rejects it as "Operator '<' cannot be
// applied to types 'string' and 'number'". It is covered in the runtime's own differential
// corpus (runtime/tests/print_numbers.c) and belongs in a js-mode golden test once js mode runs.

// Length counts UTF-16 code units.
console.log(ab.length);
console.log(''.length);
console.log('héllo'.length);
console.log('😀'.length);
