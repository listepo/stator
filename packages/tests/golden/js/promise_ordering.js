// The js-mode half of tests/golden/ts/promise_ordering.ts: the same adoption and
// `finally` interleavings, asked of untyped promises. Every promise here is `Unknown` to
// the compiler, so the ordering must come out identical through the dynamic path.
async function main() {
  // A: returning an already-resolved promise from `.then` settles the derived promise one
  // tick later than the handler's own tick (B2). R3 pushes at 4 hops; A must follow it.
  {
    const p = Promise.resolve(0);
    const r3 = p
      .then(() => {})
      .then(() => {})
      .then(() => {})
      .then(() => {
        console.log("R3");
      });
    const ad = p.then(() => Promise.resolve(1)).then(() => {
      console.log("A");
    });
    await r3;
    await ad;
  }
  // B: `new Promise((resolve) => { resolve(alreadySettled); })` settles a tick later (B2).
  {
    const p = Promise.resolve(0);
    const inner = Promise.resolve(9);
    const outer = new Promise((resolve) => {
      resolve(inner);
    });
    const o = outer.then(() => {
      console.log("O");
    });
    const t2 = p
      .then(() => {
        console.log("T1");
      })
      .then(() => {
        console.log("T2");
      });
    await t2;
    await o;
  }
  // C: `.finally(syncCb).then()` lands with the 3-deep `.then` chain (B3).
  {
    const p = Promise.resolve(0);
    const r3 = p
      .then(() => {})
      .then(() => {})
      .then(() => {})
      .then(() => {
        console.log("R3");
      });
    const f = p
      .finally(() => {
        console.log("Fcb");
      })
      .then(() => {
        console.log("F");
      });
    await r3;
    await f;
  }
  // D: `.finally(pendingCb).then()` resumes three ticks after the cb promise settles (B3).
  {
    const p = Promise.resolve(0);
    let settleR = () => {};
    const r = new Promise((resolve) => {
      settleR = resolve;
    });
    const f = p.finally(() => r).then(() => {
      console.log("F");
    });
    const m = p
      .then(() => {
        console.log("M1");
        settleR(1);
      })
      .then(() => {
        console.log("M2");
      })
      .then(() => {
        console.log("M3");
      })
      .then(() => {
        console.log("M4");
      });
    await m;
    await f;
  }
  // E: `finally` on a rejection with a sync cb keeps the original reason (B3).
  {
    const p = Promise.reject("bad");
    const f = p
      .finally(() => {
        console.log("Fcb");
      })
      .then(() => {
        console.log("unreachable");
      })
      .catch((e) => {
        console.log("E" + e);
      });
    await f;
  }
  // F: `finally` whose cb returns a rejected promise rejects with the cb reason (B3).
  {
    const p = Promise.reject("orig");
    const f = p
      .finally(() => Promise.reject("cb"))
      .then(() => {
        console.log("unreachable");
      })
      .catch((e) => {
        console.log("E" + e);
      });
    await f;
  }
  // G: returning a rejected promise from `.then` rejects with its reason (B2).
  {
    const p = Promise.resolve(0);
    const d = p
      .then(() => Promise.reject("nope"))
      .then(() => {
        console.log("unreachable");
      })
      .catch((e) => {
        console.log("A" + e);
      });
    await d;
  }
  // H: resolving a promise with itself rejects with a TypeError rather than hanging.
  // Only `name` is asserted: the message wording is ours, the class is Node's.
  {
    let doResolve = (_v) => {};
    const p = new Promise((resolve) => {
      doResolve = resolve;
    });
    doResolve(p);
    const done = p.then(
      () => {
        console.log("unreachable");
      },
      (e) => {
        if (e instanceof TypeError) {
          console.log("self " + e.name);
        } else {
          console.log("self wrong");
        }
      },
    );
    await done;
  }
  console.log("done");
}
main();
