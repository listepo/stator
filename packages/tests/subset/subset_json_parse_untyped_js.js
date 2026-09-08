// @mode: js
// @verdict: dynamic
// SUBSET.md: JSON.parse
// The js-mode norm: the text is untyped, so the compiler cannot prove it is a string and does not
// pretend to. The call is accepted and the runtime checks the tag, aborting loudly on anything
// else rather than reading a non-string as text.

export function load(text) {
  return JSON.parse(text);
}
