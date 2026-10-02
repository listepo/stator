// Two checkJs refusals js mode drops because Node runs the JavaScript as is (plan-notes 297),
// both shapes from TypeScript's own `_tsc.js`.

// TS2630: a namespace IIFE publishes its object through a function declaration's binding.
var Debug = {};
function log() {
  return 'unused';
}
(function (log2) {
  log2.level = 3;
  log2.tag = 'debug';
})(log = Debug.log || (Debug.log = {}));
console.log(Debug.log.level, Debug.log.tag, typeof log, log === Debug.log);

function greet(name) {
  return 'hi ' + name;
}
const saved = greet;
greet = { n: 1 };
console.log(typeof greet, saved('b'), greet);
greet = 5;
console.log(typeof greet, greet);

// TS2698: the checker narrows `customLevels` to `never` (the closure's assignments are
// invisible to its control flow) and refuses the spread; Node spreads what the closure built.
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
console.log(levelsFor({}));
console.log(levelsFor({ High: '30' }));
console.log(levelsFor({ Low: '1', High: '2' }));

// An untyped spread operand: CopyDataProperties skips `undefined`, `null` and the primitives
// with no own enumerable keys, and copies a string's indices.
function copy(x) {
  return { first: true, ...x, last: true };
}
console.log(copy({ q: 1, first: 'over' }));
console.log(copy(undefined), copy(null), copy(5), copy(false));
console.log(copy('hi'));
console.log(copy([7, 8]));
const parsed = JSON.parse('{"a":1,"b":[2]}');
console.log({ ...parsed, a: 9 });
