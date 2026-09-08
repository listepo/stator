// @mode: js
// @verdict: static
// SUBSET.md: Object namespace

export const ks = Object.keys({ x: 1, y: 2 });
export const vs = Object.values({ x: 1, y: 2 });
export const ns = Object.getOwnPropertyNames({ x: 1, y: 2 });
export const has = Object.hasOwn({ x: 1, y: 2 }, 'x');
