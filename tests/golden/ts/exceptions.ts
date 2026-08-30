// Exception unwinding (Task 3.10). Every throw is caught: the golden runner requires exit 0, and
// an uncaught exception exits 1 by design.

// Basic catch: the thrown value arrives in the binding, typed unknown, narrowed by typeof.
try {
  throw "plain string";
} catch (e) {
  if (typeof e === "string") {
    console.log(`caught: ${e}`);
  }
}

// Non-string thrown values round-trip untouched.
try {
  throw 42;
} catch (e) {
  console.log(typeof e);
}
try {
  throw null;
} catch (e) {
  console.log(e === null);
}

// Finally ordering: try body, then finally, whether or not something threw.
let order = "";
try {
  order = `${order}t`;
} finally {
  order = `${order}f`;
}
try {
  try {
    order = `${order}T`;
    throw "x";
  } finally {
    order = `${order}F`;
  }
} catch {
  order = `${order}c`;
}
console.log(order);

// Throw inside a loop inside a try: the landing pad is reached from a deeper control context,
// and the loop's own labels must not swallow the unwind (the ASan job runs this fixture too).
function boom(n: number): number {
  if (n > 2) {
    throw n;
  }
  return n * 10;
}
let loopLog = "";
for (let i = 0; i < 5; i += 1) {
  try {
    loopLog = `${loopLog}${boom(i)};`;
  } catch (e) {
    if (typeof e === "number") {
      loopLog = `${loopLog}c${e};`;
    }
  } finally {
    loopLog = `${loopLog}f`;
  }
}
console.log(loopLog);

// Return through finally: the finally runs, then the parked return completes.
function retThroughFinally(): number {
  try {
    return 1;
  } finally {
    console.log("finally before return");
  }
}
console.log(retThroughFinally());

// Break and continue through finally: the jump is recorded, the finally runs, the jump resumes.
let jumps = "";
for (let i = 0; i < 4; i += 1) {
  try {
    if (i === 1) {
      continue;
    }
    if (i === 3) {
      break;
    }
    jumps = `${jumps}b${i}`;
  } finally {
    jumps = `${jumps}.`;
  }
}
console.log(jumps);

// Rethrow: catching and throwing again unwinds to the NEXT enclosing try.
function rethrows(): string {
  try {
    try {
      throw "inner";
    } catch (e) {
      throw e;
    }
  } catch (e2) {
    if (typeof e2 === "string") {
      return `outer saw ${e2}`;
    }
    return "?";
  }
}
console.log(rethrows());

// A throw in a finally REPLACES the in-flight exception.
try {
  try {
    throw "first";
  } finally {
    throw "second";
  }
} catch (e) {
  if (typeof e === "string") {
    console.log(`replaced: ${e}`);
  }
}

// Exceptions cross call frames: the throw is three frames down, the catch at the top.
function level3(): number {
  throw "deep";
}
function level2(): number {
  return level3() + 1;
}
function level1(): number {
  return level2() + 1;
}
try {
  console.log(level1());
} catch (e) {
  if (typeof e === "string") {
    console.log(`from level3: ${e}`);
  }
}
