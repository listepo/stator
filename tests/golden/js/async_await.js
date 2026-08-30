// The js-mode half of tests/golden/ts/async_await.ts: the same interleaving questions, asked of
// UNTYPED async functions. Every await here operates on a value the compiler types `Unknown`, so
// the suspend/resume pair and `jsrt_promise_resolve` do the work a static promise type would
// otherwise settle at compile time -- and the ordering must come out identical either way.

async function step(tag) {
  console.log(tag + ' enter');
  const v = await Promise.resolve(1);
  console.log(tag + ' resumed');
  return v;
}

// Awaiting a non-promise still costs one tick, which is what keeps this in step with the chain.
async function plain() {
  const a = await 10;
  const b = await 20;
  return a + b;
}

async function chain() {
  let total = 0;
  total = total + (await Promise.resolve(1));
  console.log('chain 1');
  total = total + (await Promise.resolve(2));
  console.log('chain 2');
  return total;
}

async function fails() {
  await Promise.resolve(0);
  throw 'boom';
}

async function caught() {
  try {
    await fails();
    return 'unreachable';
  } catch (e) {
    return 'caught ' + e;
  }
}

async function slow() {
  await Promise.resolve(0);
  await Promise.resolve(0);
  return 10;
}

async function main() {
  const a = step('a');
  const b = step('b');
  console.log('both started');
  console.log(await a);
  console.log(await b);
  console.log(await plain());
  console.log(await chain());
  console.log(await caught());

  // Printed whole rather than indexed: without an annotation the checker calls this a TUPLE, and
  // indexing one is a property access the js tier does not have yet (STA1214). The claim under test
  // is input ORDER -- `slow` settles two ticks after the plain 30 and still lands first.
  console.log(await Promise.all([slow(), Promise.resolve(20), 30]));

  try {
    await Promise.all([Promise.resolve(1), Promise.reject('nope')]);
    console.log('unreachable');
  } catch (e) {
    console.log('all rejected ' + e);
  }
}

main();
console.log('module body done');
