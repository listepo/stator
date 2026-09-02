// Top-level await (Phase 5 step 9), untyped spelling.
console.log('before');
const x = await Promise.resolve(41);
console.log(x + 1);
console.log('after');
