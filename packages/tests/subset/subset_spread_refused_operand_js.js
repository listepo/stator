// @mode: js
// @verdict: dynamic
// SUBSET.md: Object literals with static keys
// `_tsc.js`'s polling-level merge (plan-notes 297): `customLevels` is only assigned inside a
// nested function, so the checker's control flow sees `undefined` at the `return`, narrows the
// truthy branch to `never`, and refuses the spread as TS2698. Node spreads the object the
// closure built. js mode drops the code; the literal types `any`, takes the dynamic path, and
// folds the operand through the shape-table `assign`, which reads the run-time value. The ts
// twin keeps STA0012.
function getCustomLevels(env) {
  let customLevels;
  setCustomLevel('Low');
  setCustomLevel('High');
  return customLevels;
  function setCustomLevel(level) {
    const value = env[level];
    if (value) {
      (customLevels || (customLevels = {}))[level] = +value;
    }
  }
}
function levelsFor(env) {
  const defaultLevels = { Low: 250, High: 2000 };
  const customLevels = getCustomLevels(env);
  return customLevels ? { ...defaultLevels, ...customLevels } : defaultLevels;
}
console.log(levelsFor({}), levelsFor({ High: '30' }));
