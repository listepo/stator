// @mode: js
// @verdict: dynamic
// SUBSET.md: Methods of a string or number the compiler only knows as Unknown

// `text` is an untyped parameter, so the call is a dynamic method call; the runtime answers the
// String.prototype method bound to the string.
function tail(text) {
  return text.slice(1);
}
export const t = tail("abc");
