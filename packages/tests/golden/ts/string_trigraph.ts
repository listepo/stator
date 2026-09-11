// The ts-mode twin of `js/string_trigraph.js` (plan-notes 217): the same characters, with the
// types the mode demands.
console.log('a??!b');
console.log('x??/');
console.log('q??(p');
console.log('t??-u');
console.log('end??');
console.log('????');

// The key has to reach a runtime function that takes a string; an index signature is not in this
// mode's subset, so a Map carries the same literal into the same helper.
const m = new Map<string, number>();
m.set('k??!', 1);
console.log(m.get('k??!'));

function pick(flag: boolean): string {
  return flag ? 'yes???' : 'no??=';
}
console.log(pick(true));
console.log(pick(false));
