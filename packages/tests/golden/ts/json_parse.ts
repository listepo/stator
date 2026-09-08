// JSON.parse in ts mode. The result is genuinely untyped, so it lands as `unknown` and every use
// goes through a boundary: a typeof narrowing or an `as` cast, both of which compile to a runtime
// check. Printing a parsed OBJECT is a ts-mode impossibility by design -- `unknown` is not
// assignable to console.log -- so the structural surface lives in the js fixture, and this one
// covers the three checkable tags plus what typeof answers for the rest.

const n: unknown = JSON.parse('42');
if (typeof n === 'number') {
  console.log(n + 1);
}

const neg: unknown = JSON.parse('-0');
if (typeof neg === 'number') {
  console.log(neg);
  console.log(1 / neg);
}

const big: unknown = JSON.parse('1.2345678901234568e+29');
if (typeof big === 'number') {
  console.log(big);
}

const tiny: unknown = JSON.parse('1e-7');
if (typeof tiny === 'number') {
  console.log(tiny);
}

const s: unknown = JSON.parse('"a\\"b\\\\c\\/d\\be\\ff\\ng\\rh\\ti\\u0041j\\u00e9k"');
if (typeof s === 'string') {
  console.log(s);
  console.log(s.length);
}

const astral: unknown = JSON.parse('"\\ud83d\\ude00 tail"');
if (typeof astral === 'string') {
  console.log(astral);
  console.log(astral.length);
}

const b: unknown = JSON.parse('true');
if (typeof b === 'boolean') {
  console.log(b);
}

// Whitespace is skipped everywhere the grammar allows it.
const spaced: unknown = JSON.parse('  \t\r\n  8  \n ');
if (typeof spaced === 'number') {
  console.log(spaced);
}

// An `as` cast off an Unknown is the same boundary by another spelling.
console.log(JSON.parse('7') as number);
console.log((JSON.parse('"cast"') as string).length);
console.log(JSON.parse('false') as boolean);

// typeof is total, so it answers for the values no tag check can narrow.
const nul: unknown = JSON.parse('null');
console.log(typeof nul);
const obj: unknown = JSON.parse('{"a":1}');
console.log(typeof obj);
const arr: unknown = JSON.parse('[1,2]');
console.log(typeof arr);

// The round trip: parse of stringify of a value the checker DOES know.
const round: unknown = JSON.parse(JSON.stringify('through and back'));
if (typeof round === 'string') {
  console.log(round);
}
