// The Error message slot is ToString'd (plan-notes 222). §20.5.1.1 step 3 maps an undefined
// message to the EMPTY string and everything else through ToString; the runtime stored the
// argument verbatim, so `new Error(undefined).message.length` read a length off a non-string and
// aborted on the assertion. An explicit `undefined` is reachable here through any
// `string | undefined`, which is exactly what an unchecked index read gives.
const a: string[] = [];
const e = new Error(a[0]);
console.log(e.message.length);

const f = new Error();
console.log(`[${f.message}]`);

const g = new Error('text');
console.log(g.message);
console.log(`[${g.message}]`);
