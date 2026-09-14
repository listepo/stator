// @mode: js
// @verdict: dynamic
// SUBSET.md: Classes with getters/setters
// The same always-present optional members in js mode.

class C {
  x?: number = 5;
  m?(): number {
    return this.x ?? 0;
  }
}

const c = new C();
export const x = c.x;
export const y = c.m !== undefined ? c.m() : -1;
