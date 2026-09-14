// @mode: ts
// @verdict: dynamic
// SUBSET.md: Classes with getters/setters
// An optional method WITH a body is always present at runtime -- the `?` only narrows
// assignability -- and so is an optional field WITH an initializer. Both lower as plain
// members. The checker still types the method as possibly undefined, so the call narrows.

class C {
  x?: number = 5;
  m?(): number {
    return this.x ?? 0;
  }
}

const c = new C();
export const x = c.x;
export const y = c.m !== undefined ? c.m() : -1;
