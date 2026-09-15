// Computed keys of non-string type coerce via ToPropertyKey (plan.md §8 step 2a(b), TS2464):
// an object becomes "[object Object]", `true`/`false` become "true"/"false", `null` becomes
// "null". js mode suppresses the checker's refusal and the literal takes the dynamic path.

const objKey = { [{}]: 2 };
console.log(objKey);
console.log(objKey["[object Object]"]);

const boolKey = { [true]: 1, [false]: 2 };
console.log(boolKey);
console.log(boolKey["true"]);
console.log(boolKey["false"]);

const nullKey = { [null]: 3 };
console.log(nullKey);
console.log(nullKey["null"]);
