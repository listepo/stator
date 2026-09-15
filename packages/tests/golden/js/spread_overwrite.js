// A spread overwriting an explicit key is legal JavaScript — last wins.
// js mode takes the value; ts mode refuses with STA0012.

/** @param {{a: number, b: number}} o */
function overwritten(o) {
  return { b: 9, ...o, a: 7 };
}
console.log(JSON.stringify(overwritten({ a: 1, b: 2 })));

/** @param {{a: number}} o */
function winner(o) {
  return { ...o, a: 7 };
}
console.log(JSON.stringify(winner({ a: 1 })));

/** @param {{a: number}} o */
function spreadWins(o) {
  return { a: 9, ...o };
}
console.log(JSON.stringify(spreadWins({ a: 5 })));

const lit = { b: 9, ...{ a: 1, b: 2 }, a: 7 };
console.log(JSON.stringify(lit));
console.log(Object.keys(overwritten({ a: 1, b: 2 })).join(","));
