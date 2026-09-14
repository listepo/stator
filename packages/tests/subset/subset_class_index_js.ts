// @mode: js
// @verdict: static
// SUBSET.md: Classes with getters/setters
// An index signature adds no slot: the declared members take the ordinary paths, while a
// dynamic key through it waits on dictionary mode.

class C {
  [k: string]: number;
  x = 1;
}

const c = new C();
export const x = c.x;
