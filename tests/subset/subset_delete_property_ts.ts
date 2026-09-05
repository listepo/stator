// @mode: ts
// @verdict: dynamic
// SUBSET.md: delete on a dynamic shape (optional property / index signature)

const o: { a?: number; b?: number } = { a: 1, b: 2 };
const gone: boolean = delete o.a;
export { gone, o };
