// Deep recursion throws Node's catchable RangeError, not a SIGSEGV (plan.md §9 Task 6.23).
function down(n: number): number {
  return n === 0 ? 0 : 1 + down(n - 1);
}

try {
  down(10000000);
  console.log('unreachable');
} catch (e) {
  if (e instanceof RangeError) {
    console.log(e.name, e.message);
  }
}

// The stack is whole again after the catch.
console.log(down(1000));

class Walker {
  step(n: number): number {
    return this.step(n + 1);
  }
}

try {
  new Walker().step(0);
} catch (e) {
  console.log(e instanceof RangeError, (e as Error).message);
}

function ping(n: number): number {
  return pong(n + 1);
}
function pong(n: number): number {
  return ping(n + 1);
}

let caught = 0;
for (let i = 0; i < 3; i++) {
  try {
    ping(0);
  } catch (e) {
    if (e instanceof RangeError) caught++;
  }
}
console.log('caught', caught);
