// @mode: ts
// @verdict: dynamic
// SUBSET.md: RegExp.prototype methods
// `exec` answers the MATCH ARRAY: a dense array of the capture groups that ALSO carries `index`,
// `input` and `groups` as properties, which is why a jsrt array has a property table at all
// (Task 4.1). The verdict is DYNAMIC rather than static because the answer is a match OR null --
// a union the HIR does not model -- so the binding is Unknown even though every read off it
// lowers to a fixed runtime call.

const re = /(h)(e)llo/;
const found = re.exec('hello world');
export { found };
