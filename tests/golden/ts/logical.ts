// Short-circuiting operators. The property under test is that the result is one of the OPERANDS,
// not a boolean: `0 || 5` is 5, and `5 && 0` is 0. A compiler that lowered these to a boolean
// `and`/`or` would print `true`/`false` here and be wrong on every line.
console.log(1 && 2);
console.log(0 && 2);
console.log(1 || 2);
console.log(0 || 2);

console.log(true && false);
console.log(false || true);

// ToBoolean decides the branch, so every falsy value behaves the same way.
const nan: number = 0 / 0;
console.log(nan || 7);
console.log(nan && 7);

// `??` tests nullish, NOT falsy — this is the pair that distinguishes it from `||`. The operands
// are typed as unions rather than written as literals because TypeScript rejects a `??` whose
// answer it can already see ("right operand is unreachable").
const maybeNull: number | null = null;
const maybeZero: number | null = 0;
const maybeFalse: boolean | null = false;
console.log(maybeNull ?? 5);
console.log(maybeZero ?? 5);
console.log(maybeFalse ?? 5);
console.log(maybeZero || 5);

// Nesting: the outer operator's left operand stays live while the inner one is evaluated, so
// each needs its own temporary.
console.log(1 && 2 && 3);
console.log(0 || 0 || 3);
console.log((1 && 0) || 9);
