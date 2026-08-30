// Async functions and `await` (Task 4.6). The question this fixture asks is not "does it finish
// with the right answer" but "does it INTERLEAVE like Node", which is the part of a promise
// implementation that is easy to get subtly wrong and invisible in a single-chain test.

// An async function's body runs synchronously up to its first await, and only then yields. Two of
// them started back to back must therefore print both prefixes before either suffix.
async function step(tag: string): Promise<number> {
  console.log(tag + ' enter');
  const v: number = await Promise.resolve(1);
  console.log(tag + ' resumed');
  return v;
}

// `await` of a NON-promise still costs exactly one tick, so this lands between the two ticks of a
// chain that awaits promises -- the property that separates a real queue from an inlined callback.
async function plain(): Promise<number> {
  const a: number = await 10;
  const b: number = await 20;
  return a + b;
}

// A chain: each await is one tick, so the depth of the chain is observable in the interleaving.
async function chain(): Promise<number> {
  let total: number = 0;
  total = total + (await Promise.resolve(1));
  console.log('chain 1');
  total = total + (await Promise.resolve(2));
  console.log('chain 2');
  total = total + (await Promise.resolve(3));
  console.log('chain 3');
  return total;
}

// A throw inside an async body rejects its promise rather than propagating, so an `await` of it
// inside a `try` is an ordinary catch -- no new protocol, and the reason arrives intact.
async function fails(): Promise<number> {
  await Promise.resolve(0);
  throw 'boom';
}

async function caught(): Promise<string> {
  try {
    await fails();
    return 'unreachable';
  } catch (e) {
    return 'caught ' + e;
  }
}

// Promise.all: results in INPUT order however the elements settle, and a plain value in the list
// counts as already-resolved. `slow` resolves after two ticks, `20` after none.
async function slow(): Promise<number> {
  await Promise.resolve(0);
  await Promise.resolve(0);
  return 10;
}

async function main(): Promise<void> {
  const a: Promise<number> = step('a');
  const b: Promise<number> = step('b');
  console.log('both started');
  console.log(await a);
  console.log(await b);

  console.log(await plain());
  console.log(await chain());
  console.log(await caught());

  const all: number[] = await Promise.all([slow(), Promise.resolve(20), 30]);
  console.log(all[0]);
  console.log(all[1]);
  console.log(all[2]);
  console.log(all.length);

  const empty: number[] = await Promise.all([]);
  console.log(empty.length);

  // Promise.resolve of a promise is the SAME promise, so awaiting it twice reads one value.
  const once: Promise<number> = Promise.resolve(7);
  console.log(await Promise.resolve(once));
  console.log(await once);

  // A rejection reaches the awaiting frame as a throw, and the first rejection of a Promise.all
  // wins over anything that settles later.
  try {
    await Promise.all([Promise.resolve(1), Promise.reject('nope')]);
    console.log('unreachable');
  } catch (e) {
    console.log('all rejected ' + e);
  }
}

main();
console.log('module body done');
