// @mode: js
// @verdict: dynamic
// SUBSET.md: Assignment to a property the object's shape does not declare

// Compound, logical and update forms read the undeclared name first (`undefined` until grown),
// then grow it (docs/VALUE.md §4.24).
const info = { name: 'b' };
info.count ??= 1;
info.count += 2;
info.count++;
console.log(info.count);
