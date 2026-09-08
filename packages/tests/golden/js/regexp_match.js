// `exec` and `match` in js mode. The interesting difference from the ts fixture is the UNTYPED
// receiver: a match reaching a property read has no annotation behind it at all, so what proves
// `m.index` is a match read is the checker's own inference from `exec`'s lib signature — and the
// runtime settles it a second time, because a tag it cannot walk is a panic rather than a misread.

const pair = /(\d+)-(\w+)/;

function parse(s) {
  const m = pair.exec(s);
  if (m === null) {
    return 'no match';
  }
  return m[1] + '/' + m[2] + '@' + m.index;
}

console.log(parse('12-ab'));
console.log(parse('nope'));
console.log(parse('xx 345-zz'));

// The match prints whole, properties and all, from an untyped binding.
console.log(pair.exec('12-ab'));
console.log(/a(x)?(b)/.exec('ab'));
console.log(/(?<year>\d{4})/.exec('in 2026'));

// match, both flavours.
console.log('a bc def'.match(/[a-z]+/g));
console.log('a bc def'.match(/(b)(c)/));
console.log('a bc def'.match(/z/g));
