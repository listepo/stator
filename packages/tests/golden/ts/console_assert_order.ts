// `console.assert(cond, msg)` evaluates its arguments LEFT TO RIGHT (plan-notes 221). The message
// is an ordinary expression, so it may have effects -- and C evaluates function arguments in an
// unspecified order, which ran the message first and then read the array it had just mutated.
// Node sees the assertion pass; Stator reported "Assertion failed: mutated" on stderr.
function mutate(a: number[]): string {
  a[0] = 99;
  return 'mutated';
}

const a: number[] = [1];
console.assert(a[0] === 1, mutate(a));
console.assert(a[0] === 99, 'the first message really did run');

// A second argument with an effect, checked through what it did rather than through the console.
let calls = 0;
function tick(): number {
  calls += 1;
  return calls;
}
console.assert(calls === 0, `calls was ${tick()}`);
console.log(calls);

// A passing assertion prints nothing at all, which is the other half of the contract.
console.assert(a.length === 1, mutate([2]));
console.log(a[0]);
