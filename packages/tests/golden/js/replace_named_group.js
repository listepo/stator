// Named-group substitution in `String.prototype.replace` (plan.md §8 step 21c): `$<name>`
// answers the participating capture. An unknown or unmatched name is EMPTY, not literal; with
// no closing `>` -- or a pattern declaring no named groups at all -- the `$` stays literal.

console.log('ab'.replace(/(?<x>a)/, '[$<x>]'));
console.log('ab'.replace(/(?<x>a)(?<y>b)/, '<$<y>-<$<x>>'));
console.log('ab'.replace(/(?<x>a)/, '[$<y>]'));
console.log('ab'.replace(/(?<x>a?)/, '[$<x>]'));
console.log('ab'.replace(/(?<x>a)/, '[$<x]'));
console.log('ab'.replace(/(a)/, '[$<x>]'));
console.log('ab'.replace(/(?<x>a)/, '$<x'));
console.log('ab'.replace(/(?<x>a)/, '$<>'));
console.log('ab'.replace(/(?<x>a)/, '$<x-y>'));

// Duplicate names live on disjoint alternatives: the one that took part wins.
console.log('ab'.replace(/(?<x>a)|(?<x>b)/, '[$<x>]'));
console.log('cb'.replace(/(?<x>a)|(?<x>b)/, '[$<x>]'));

// The name runs to the FIRST `>`, whatever it holds, and the old escapes compose.
console.log('ab'.replace(/(?<x>a)/, '$<x>>'));
console.log('ab'.replace(/(?<x>a)/, '$$<$<x>>'));
console.log('ab'.replace(/(?<x>a)/, '$&<$<x>>$`'));
