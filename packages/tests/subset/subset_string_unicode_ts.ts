// @mode: ts
// @verdict: static
// SUBSET.md: String.prototype
// Case mapping and normalization through the vendored libunicode tables. Both are defined on CODE
// POINTS, and both can change a string's length -- `normalize()` with no argument means NFC, which
// is the padding rule holding for one more op.

const shouted = 'stra\u00dfe'.toUpperCase();
const quiet = '\u039f\u0394\u039f\u03a3'.toLowerCase();
const nfc = '\u0065\u0301'.normalize();
const nfd = '\u00e9'.normalize('NFD');
export { shouted, quiet, nfc, nfd };
