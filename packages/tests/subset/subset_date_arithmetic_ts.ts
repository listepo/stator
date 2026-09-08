// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Date
// Date arithmetic needs NO gate rule: the checker already refuses it. `d2 - d1` relies on
// §21.4.4.45's `[Symbol.toPrimitive]` hint, and `lib.es5.d.ts` types both operands `Date`, so
// strict TypeScript reports "The left-hand side of an arithmetic operation must be of type
// 'any', 'number', 'bigint' or an enum type" before this compiler is asked anything.
//
// The sanctioned spelling is `d2.getTime() - d1.getTime()`, which is two numbers and is what the
// golden fixtures use. This file exists so that a future `Symbol.toPrimitive` slice cannot make
// the arithmetic silently start working without someone deciding it should.
const a = new Date(0);
const b = new Date(1000);
export const gap = b - a;
