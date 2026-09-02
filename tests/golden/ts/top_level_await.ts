// Top-level await (Phase 5 step 9): the module body is an async unit.
console.log('before');
const x: number = await Promise.resolve(41);
console.log(x + 1);
console.log('after');
