// @mode: js
// @verdict: error
// @code: STA1110
// SUBSET.md: a CommonJS project file — without --node it is not routed to the bundler, and its
// module.exports / exports are STA1110 (plan-notes 315). With --node it goes to the bundler whole;
// that cell needs an adapter, so packages/tests/unit/bundler.test.ts proves it.

module.exports = { n: 1 };
exports.m = 2;
