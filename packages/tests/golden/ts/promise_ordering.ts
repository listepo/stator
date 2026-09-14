// Promise microtask ordering (plan.md §8 step 35): adoption costs a subscribe job of its
// own and `finally` keeps the spec's pass-through wrapper, so both land exactly where Node
// lands rather than a tick early. Each scenario races the construct against a `.then` ruler
// whose depth is known; the printed order is the assertion.
async function main(): Promise<void> {
  // A: returning an already-resolved promise from `.then` settles the derived promise one
  // tick later than the handler's own tick (B2). R3 pushes at 4 hops; A must follow it.
  {
    const p: Promise<number> = Promise.resolve(0);
    const r3: Promise<void> = p
      .then((): void => {})
      .then((): void => {})
      .then((): void => {})
      .then((): void => {
        console.log("R3");
      });
    const ad: Promise<void> = p.then((): Promise<number> => Promise.resolve(1)).then((): void => {
      console.log("A");
    });
    await r3;
    await ad;
  }
  // B: `new Promise((resolve) => { resolve(alreadySettled); })` settles a tick later (B2).
  {
    const p: Promise<number> = Promise.resolve(0);
    const inner: Promise<number> = Promise.resolve(9);
    const outer: Promise<number> = new Promise<number>((resolve): void => {
      resolve(inner);
    });
    const o: Promise<void> = outer.then((): void => {
      console.log("O");
    });
    const t2: Promise<void> = p
      .then((): void => {
        console.log("T1");
      })
      .then((): void => {
        console.log("T2");
      });
    await t2;
    await o;
  }
  // C: `.finally(syncCb).then()` lands with the 3-deep `.then` chain (B3).
  {
    const p: Promise<number> = Promise.resolve(0);
    const r3: Promise<void> = p
      .then((): void => {})
      .then((): void => {})
      .then((): void => {})
      .then((): void => {
        console.log("R3");
      });
    const f: Promise<void> = p
      .finally((): void => {
        console.log("Fcb");
      })
      .then((): void => {
        console.log("F");
      });
    await r3;
    await f;
  }
  // D: `.finally(pendingCb).then()` resumes three ticks after the cb promise settles (B3).
  {
    const p: Promise<number> = Promise.resolve(0);
    let settleR: (value: number | PromiseLike<number>) => void = (): void => {};
    const r: Promise<number> = new Promise<number>((resolve): void => {
      settleR = resolve;
    });
    const f: Promise<void> = p.finally((): Promise<number> => r).then((): void => {
      console.log("F");
    });
    const m: Promise<void> = p
      .then((): void => {
        console.log("M1");
        settleR(1);
      })
      .then((): void => {
        console.log("M2");
      })
      .then((): void => {
        console.log("M3");
      })
      .then((): void => {
        console.log("M4");
      });
    await m;
    await f;
  }
  // E: `finally` on a rejection with a sync cb keeps the original reason (B3).
  {
    const p: Promise<never> = Promise.reject("bad");
    const f: Promise<void> = p
      .finally((): void => {
        console.log("Fcb");
      })
      .then((): void => {
        console.log("unreachable");
      })
      .catch((e: string): void => {
        console.log("E" + e);
      });
    await f;
  }
  // F: `finally` whose cb returns a rejected promise rejects with the cb reason (B3).
  {
    const p: Promise<never> = Promise.reject("orig");
    const f: Promise<void> = p
      .finally((): Promise<never> => Promise.reject("cb"))
      .then((): void => {
        console.log("unreachable");
      })
      .catch((e: string): void => {
        console.log("E" + e);
      });
    await f;
  }
  // G: returning a rejected promise from `.then` rejects with its reason (B2).
  {
    const p: Promise<number> = Promise.resolve(0);
    const d: Promise<void> = p
      .then((): Promise<never> => Promise.reject("nope"))
      .then((): void => {
        console.log("unreachable");
      })
      .catch((e: string): void => {
        console.log("A" + e);
      });
    await d;
  }
  // H: resolving a promise with itself rejects with a TypeError rather than hanging.
  // Only `name` is asserted: the message wording is ours, the class is Node's.
  {
    let doResolve: (value: number | PromiseLike<number>) => void = (): void => {};
    const p: Promise<number> = new Promise<number>((resolve): void => {
      doResolve = resolve;
    });
    doResolve(p);
    const done: Promise<void> = p.then(
      (): void => {
        console.log("unreachable");
      },
      (e: unknown): void => {
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
