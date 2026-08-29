// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: RegExp literals

const re: RegExp = /hello/i;
export { re };
