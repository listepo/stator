// @mode: js
// @verdict: static
// SUBSET.md: Object.freeze / Object.isFrozen

const o = { x: 1 };
Object.freeze(o);
console.log(Object.isFrozen(o));
