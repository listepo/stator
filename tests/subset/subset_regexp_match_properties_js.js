// @mode: js
// @verdict: dynamic
// SUBSET.md: RegExp.prototype methods
// The same four names off an untyped binding. Nothing here is annotated, and nothing needs to be:
// the checker infers the match from `exec`'s lib signature, and the runtime settles the tag a
// second time inside `jsrt_get_prop`.

const re = /(?<d>\d+)/;
const m = re.exec('a12');
if (m !== null) {
  console.log(m[0]);
  console.log(m.length);
  console.log(m.index);
  console.log(m.input);
  console.log(m.groups);
}
