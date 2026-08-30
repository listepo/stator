// @mode: ts
// @verdict: error
// @code: STA1003
// SUBSET.md: JSON.parse
// JSON.parse is supported, but the lib types its result `any`, and any-in-ts-mode is an error by
// design: an UNANNOTATED binding is refused at the declaration, before the call is ever gated.
// The annotated spelling is the supported one -- see subset_json_parse_annotated_ts.

export const v = JSON.parse('{"x":1}');
