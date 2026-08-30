// @mode: js
// @verdict: not-yet
// @code: STA1215
// SUBSET.md: String.prototype
// The js-mode counterpart: the ICU feature build is a property of the RUNTIME the program links,
// so the refusal is the same in both modes -- nothing about it is a typing question.

const order = 'a'.localeCompare('b', 'en');
const shouted = 'i'.toLocaleUpperCase('tr');
const quiet = 'I'.toLocaleLowerCase('tr');
export { order, shouted, quiet };
