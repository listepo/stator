// Prefix unary operators. The interesting one is `-`: it is the only operator that manufactures
// a negative zero out of a positive one, which is why no pass may treat it as an identity or
// rewrite it to `0 - x` (docs/NUMERIC.md §3.4, §9).
const zero: number = 0;
console.log(-zero);
console.log(-(-zero));
console.log(0 - zero);

const five: number = 5;
console.log(-five);
console.log(+five);
console.log(~five);
console.log(~-1);

// `!` is ToBoolean, so it answers for every falsy value, not just `false`.
console.log(!true);
console.log(!false);
console.log(!zero);
console.log(!five);
console.log(!!zero);

const nan: number = 0 / 0;
console.log(!nan);
console.log(-nan);
