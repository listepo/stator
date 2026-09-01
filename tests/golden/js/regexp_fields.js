// The same data-property surface in js mode. Nothing is annotated here, so what proves each read is
// a RegExp field is the checker's own inference from the literal -- the ts fixture's receivers are
// inferred too, but here there is no annotation available even in principle.

const re = /(\w+)@(\w+)\.com/gi;
console.log(re.source);
console.log(re.flags);
console.log(re.global);
console.log(re.ignoreCase);
console.log(re.multiline);
console.log(re.lastIndex);
console.log(re.toString());
console.log(re);

// A regexp reaching an UNTYPED parameter loses the only proof there was -- the checker types the
// parameter `any`, so `pattern.source` is an ordinary dynamic property read and the gate refuses
// it. The receiver has to be one the checker can still see, which a local binding is.
const anchored = /^\s+$/;
console.log(anchored.source + ' [' + anchored.flags + ']');
const odd = /x/muy;
console.log(odd.source + ' [' + odd.flags + ']');

// The field read feeding a scan, and the scan moving the field.
const g = /o/g;
while (g.test('foo boo')) {
  console.log(g.lastIndex);
}
console.log(g.lastIndex);
