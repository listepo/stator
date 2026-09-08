// @mode: js
// @verdict: static
// SUBSET.md: RegExp.prototype data properties
// The eleven data properties of §22.2.6. Every one is DERIVED from the compiled regexp -- `source`
// and `flags` are the two strings the runtime normalized at construction, the rest are one bit test
// or one header read -- so the read is a struct load behind a fixed C signature, not a shape-table
// lookup, and it is static in both modes.

const re = /a(b)c/gi;
console.log(re.source);
console.log(re.flags);
console.log(re.lastIndex);
console.log(re.global);
console.log(re.ignoreCase);
console.log(re.multiline);
console.log(re.dotAll);
console.log(re.sticky);
console.log(re.unicode);
console.log(re.hasIndices);
console.log(re.toString());
