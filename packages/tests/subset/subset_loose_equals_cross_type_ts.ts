// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: loose equality

// The same source in ts mode: when both operand types are known and disjoint, a `==` between them
// cannot be anything but a mistake, so the checker's 2367 stands. The js fixture is the other half.
const empty: string = "";
const zero: number = 0;
console.log(empty == zero);
