// @mode: js
// @verdict: error
// @code: STA0012
// Named function expression inner names are immutable; the checker rejects reassignment.

const g = function imm() {
  imm = 1;
};
