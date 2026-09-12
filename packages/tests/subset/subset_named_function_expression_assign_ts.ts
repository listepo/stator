// @mode: ts
// @verdict: error
// @code: STA0012
// Named function expression inner names are immutable; TypeScript rejects reassignment at compile time.

const g: () => void = function imm(): void {
  imm = 1;
};
