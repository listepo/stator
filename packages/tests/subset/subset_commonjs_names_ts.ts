// @mode: ts
// @verdict: static
// SUBSET.md: CommonJS module.exports / exports — a property, member or binding-pattern NAME
// spelled exports, require or module reads no binding and is not STA1110 (plan-notes 315).

const o = { exports: 1, require: 2, module: 3 };
const { exports: e } = o;
class C { exports = 1; require() { return 1; } }
console.log(o.exports, e, new C().exports);
export {};
