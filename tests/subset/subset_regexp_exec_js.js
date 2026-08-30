// @mode: js
// @verdict: not-yet
// @code: STA1211
// SUBSET.md: RegExp.prototype methods
// `exec` answers an ARRAY WITH PROPERTIES -- `index`, `input` and `groups` hang off the match
// array -- and a jsrt array is dense with no property table. Landing it would mean either a wrong
// answer or a representation change, so it keeps the family's code until the object model grows.

const re = /(h)(e)llo/;
const found = re.exec('hello world');
export { found };
