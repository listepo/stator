// @mode: ts
// @verdict: static
// SUBSET.md: String.prototype
// The regexp forms of the pattern-taking string methods, and `search`, which has no string form at
// all. Each is the SAME op node as its string form -- the runtime dispatches on the pattern's tag.

const at = 'a1b'.search(/\d/);
const parts = 'a1b'.split(/\d/);
const once = 'a1b'.replace(/\d/, '#');
const every = 'a1b1c'.replaceAll(/\d/g, '#');
export { at, parts, once, every };
