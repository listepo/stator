// `for...of` calls IteratorClose on abrupt exit (plan.md §8 step 34): a `break`, `return`
// or `throw` out of the body runs the iterator's `return()` — a generator's `finally`.
// `continue` does not close, and a stored iterator keeps yielding after the loop breaks.

function* g(): Generator<number, void, unknown> {
  try {
    yield 1;
    yield 2;
    yield 3;
  } finally {
    console.log("closed");
  }
}

function* outer(): Generator<string, void, unknown> {
  try {
    yield "o1";
    yield "o2";
  } finally {
    console.log("outer closed");
  }
}

// A bare return parks `undefined` in slot 0, which is the loop's own iterable slot when the
// function returns no value — the fin must still find the iterator (plan.md §8 step 34).
function run(): void {
  for (const v of g()) {
    if (v === 1) {
      return;
    }
  }
}

function first(): number {
  for (const v of g()) {
    return v;
  }
  return -1;
}

async function abreak(): Promise<void> {
  for (const v of g()) {
    if (v === 1) {
      break;
    }
  }
  console.log("async after break");
}

async function main(): Promise<void> {
  // break closes.
  for (const v of g()) {
    console.log(v);
    if (v === 1) {
      break;
    }
  }
  console.log("after break");

  // continue does not close: the loop runs to exhaustion, which completes the generator.
  for (const v of g()) {
    if (v === 1) {
      continue;
    }
    console.log(v);
  }
  console.log("after continue");

  run();
  console.log("after return");

  console.log(first());
  console.log("after return-value");

  // throw closes, and the original exception propagates.
  try {
    for (const v of g()) {
      if (v === 1) {
        throw "boom";
      }
    }
  } catch (e) {
    console.log("caught " + e);
  }
  console.log("after throw");

  // A throw from the `finally` does not replace the exception that closed the loop.
  try {
    for (const v of gthrow()) {
      throw "body-boom";
    }
  } catch (e) {
    console.log("caught " + e);
  }

  // Breaking out of a stored iterator does not finish it: it keeps yielding.
  const it = [10, 20, 30].values();
  for (const v of it) {
    console.log(v);
    break;
  }
  console.log(it.next());

  // Breaking out of the inner loop closes the inner generator, not the outer one.
  for (const o of outer()) {
    for (const v of g()) {
      if (v === 1) {
        break;
      }
    }
    console.log(o);
    break;
  }
  console.log("after nested");

  await abreak();
  console.log("done");
}

function* gthrow(): Generator<number, void, unknown> {
  try {
    yield 1;
  } finally {
    throw "fin-boom";
  }
}

main();
