// JSON.parse in js mode: the structural surface. An untyped binding takes the parsed value
// straight to console.log, so objects (dynamic shapes, in insertion order, with Node's key
// quoting), arrays, nesting past the inspect depth cap, and every leaf kind print through the
// same inspector Node uses -- byte-for-byte.

const flat = JSON.parse('{"a":1,"b":"two","c":true,"d":null}');
console.log(flat);

const arr = JSON.parse('[1,2,[3,4],{"k":"v"}]');
console.log(arr);

const nums = JSON.parse('[0,-0,1e3,1.5,-2.25,1e-7,123456789012345678901234567890]');
console.log(nums);

const esc = JSON.parse('"a\\"b\\\\c\\/d\\be\\ff\\ng\\rh\\ti\\u0041j\\u00e9k"');
console.log(esc);

const astral = JSON.parse('"\\ud83d\\ude00 tail"');
console.log(astral);

const ws = JSON.parse('  \t\r\n { "x" : [ 1 , 2 ] } \n ');
console.log(ws);

const empties = JSON.parse('[{},[],"",0]');
console.log(empties);

// Duplicate keys: the last one wins, and the key keeps its FIRST position -- the shape already
// holds the slot, so the second assignment overwrites in place.
const dup = JSON.parse('{"k":1,"j":2,"k":3}');
console.log(dup);

// Deeper than console.log's depth cap: the inspector abbreviates, exactly as Node does.
const nested = JSON.parse('{"a":{"b":{"c":[{"d":1}]}}}');
console.log(nested);

// Keys that are not identifiers get quoted; ones that are print bare.
const keys = JSON.parse('{"a-b":1,"":2,"9x":3,"ok":4}');
console.log(keys);

// A top-level value need not be a structure.
console.log(JSON.parse('42'));
console.log(JSON.parse('"bare"'));
console.log(JSON.parse('true'));
console.log(JSON.parse('null'));

// Round trip through both directions.
const round = JSON.parse(JSON.stringify({ a: [1, 'x', false], b: { c: 2.5 } }));
console.log(round);
console.log(JSON.stringify(round));
