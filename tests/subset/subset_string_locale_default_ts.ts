// @mode: ts
// @verdict: not-yet
// @code: STA1215
// SUBSET.md: String.prototype
// The ABSENT-locale form is refused first, and by the same code: the flag is what the program is
// missing. Even with ICU linked it stays refused -- the spec reads the host's default locale
// there, which would make the compiled program's output depend on the machine that runs it.

const order = 'a'.localeCompare('b');
export { order };
