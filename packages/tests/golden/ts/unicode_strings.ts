// Unicode case mapping and normalization, against the tables vendored with libregexp (Task 4.3).
// Both are defined on CODE POINTS rather than code units, and both can change a string's LENGTH,
// which is what makes a per-unit walk the wrong shape for either.

// The multi-character mappings: one code point in, two or three out.
console.log('Straße'.toUpperCase());
console.log('ﬃ'.toUpperCase());
console.log('ŉ'.toUpperCase());

// Accented Latin, both directions.
console.log('café'.toUpperCase());
console.log('CAFÉ'.toLowerCase());
console.log('ÀÈÌÒÙ'.toLowerCase());

// Final sigma: the one context-dependent rule ECMA-262 keeps. A capital sigma at the end of a word
// lowercases to the final form; in the middle of one it does not.
console.log('ΟΔΟΣ'.toLowerCase());
console.log('ΣΟΣ'.toLowerCase());
console.log('ΑΣ ΑΣ'.toLowerCase());
console.log('Σ'.toLowerCase());
console.log('ΑΣΒ'.toLowerCase());

// Cyrillic and Greek round trips.
console.log('Привет'.toUpperCase());
console.log('АБВ'.toLowerCase());
console.log('αβγ'.toUpperCase());

// Above the BMP: a surrogate PAIR is one code point, and Deseret has cases.
console.log('\u{10400}'.toLowerCase());
console.log('\u{10428}'.toUpperCase());
console.log('\u{1F600}'.toUpperCase());

// A lone surrogate is a legal JS string and survives untouched.
console.log('a\ud800b'.toUpperCase().length);

// An ASCII string takes the same path it always did.
console.log('Hello, World!'.toUpperCase());
console.log('Hello, World!'.toLowerCase());
console.log(''.toUpperCase());

// normalize: the default is NFC, and the four forms differ in length as well as in content.
const composed = 'é';
console.log(composed.length);
console.log(composed.normalize().length);
console.log(composed.normalize('NFC').length);
console.log(composed.normalize('NFD').length);
console.log(composed.normalize() === 'é');
console.log('é'.normalize('NFD').length);

// The compatibility forms fold what the canonical ones leave alone.
console.log('ﬁ'.normalize('NFC'));
console.log('ﬁ'.normalize('NFKC'));
console.log('①'.normalize('NFKD'));
console.log('ＡＢ'.normalize('NFKC'));

// Canonical ordering: two combining marks come back in class order whichever way they went in.
console.log('q̣̇'.normalize('NFC') === 'q̣̇'.normalize('NFC'));
console.log('ḍ̇'.normalize('NFC').length);
console.log('ḍ̇'.normalize('NFD').length);

// Idempotence, and a string with nothing to do.
console.log('abc'.normalize('NFKD'));
console.log(''.normalize('NFD').length);
