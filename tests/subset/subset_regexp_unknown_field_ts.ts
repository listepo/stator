// @mode: ts
// @verdict: not-yet
// @code: STA1211
// SUBSET.md: RegExp.prototype data properties
// `compile` is the member outside both closed tables: Annex B legacy that RECOMPILES a regexp in
// place, with an optional second argument the fixed-arity op table cannot express (plan-notes 121).

const re = /a/;
re.compile('b', 'g');
