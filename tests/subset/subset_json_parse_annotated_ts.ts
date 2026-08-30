// @mode: ts
// @verdict: dynamic
// SUBSET.md: JSON.parse
// Annotated, so implicit-any never fires: the binding is `unknown`, which is exactly what the
// lowering types the call. The verdict is `dynamic` and stays that way -- parse answers data the
// checker cannot see into, and every use of it is a boundary the program must check.

export const v: unknown = JSON.parse('{"x":1}');
