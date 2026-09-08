// @mode: ts
// @verdict: not-yet
// @code: STA1215
// SUBSET.md: String.prototype
// Collation and TAILORED casing are CLDR data, not Unicode tables: they land only in the ICU
// feature build (`just runtime-intl`, STATOR_RUNTIME=intl), which is off by default. Without
// it the gate refuses them by name rather than letting a program link against a stub.

const order = 'a'.localeCompare('b', 'en');
const shouted = 'i'.toLocaleUpperCase('tr');
const quiet = 'I'.toLocaleLowerCase('tr');
export { order, shouted, quiet };
