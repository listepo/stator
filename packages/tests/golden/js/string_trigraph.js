// Trigraph sequences in string content and property keys (plan-notes 217). The emitted C is
// compiled with `-std=c11`, where `??!` `??/` `??(` `??-` and friends are single characters inside
// a string literal: `"a??!b"` printed `a|b`, and a literal ending `??/` ate its own closing quote
// and failed the C compile. Every `?` is emitted as `\?` now, which is the same character and no
// trigraph.
console.log('a??!b');
console.log('x??/');
console.log('q??(p');
console.log('t??-u');
console.log('end??');
console.log('????');

const o = {};
o['k??!'] = 1;
console.log(o['k??!']);
console.log(JSON.stringify(o));

function pick(flag) {
  return flag ? 'yes???' : 'no??=';
}
console.log(pick(true));
console.log(pick(false));
