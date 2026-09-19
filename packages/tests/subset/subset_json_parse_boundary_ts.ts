// @mode: ts
// @verdict: error
// @code: STA1001
// SUBSET.md: JSON.parse() boundary. The lib types the result `any`, and the entry file's own
// explicit `: any` return annotation is what the gate's mode-wide STA1001 walk fires on first
// (gate.ts visitNode hasExplicitAny arm runs before any call-site rule) — measured 2026-09-19
// on this branch. The supported spelling stays subset_json_parse_annotated_ts (`unknown`).

export function parse(s: string): any {
  const data = JSON.parse(s);
  return data.x;
}
