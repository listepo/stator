// §27.2.1.3.2's [[AlreadyResolved]] (plan-notes 222). The first resolution wins -- a value, a
// rejection, or ADOPTING another promise -- and the last case is the one that needs state of its
// own: adoption leaves the outer promise PENDING while the inner one settles, which is exactly the
// window in which `resolve(inner); reject(x)` used to reject.
async function main() {
  const inner = Promise.resolve(42);
  const adopted = new Promise(function (resolve, reject) {
    resolve(inner);
    reject(new Error('never'));
  });
  console.log(await adopted);

  const twice = new Promise(function (resolve) {
    resolve(7);
    resolve(8);
  });
  console.log(await twice);

  const rejectedFirst = new Promise(function (resolve, reject) {
    reject(new Error('first'));
    resolve('second');
  });
  try {
    await rejectedFirst;
  } catch (e) {
    console.log(`caught ${e.message}`);
  }

  const adoptedRejection = new Promise(function (resolve, reject) {
    resolve(Promise.reject(new Error('inner-reject')));
    reject(new Error('outer-reject'));
  });
  try {
    await adoptedRejection;
  } catch (e) {
    console.log(`caught ${e.message}`);
  }

  // A promise has to SURVIVE being constructed: the executor resolves it, and the resolver pair
  // allocates in between. The `await` inside the loop is deliberate as well -- suspending inside a
  // loop whose body captures the binding is the case the emitter used to resume into the middle of
  // a C block (plan.md §8 step 15, plan-notes 226), and this fixture is the one that found it.
  for (let i = 0; i < 2000; i += 1) {
    const p = new Promise(function (resolve) {
      resolve(i);
    });
    if (i === 1999) {
      console.log(await p);
    }
  }
  console.log('done');
}
main();
