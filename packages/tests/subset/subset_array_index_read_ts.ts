// @mode: ts
// @verdict: dynamic
// SUBSET.md: Arrays: index access

// `noUncheckedIndexedAccess` types an indexed read as `number | undefined`, because the index may
// be out of range -- and it really does yield `undefined` there. That union is Unknown to HType, so
// the read is dynamic until Task 3.5 inserts the narrowing check (plan-notes 53).
const arr: number[] = [1, 2, 3];
console.log(arr[0]);
