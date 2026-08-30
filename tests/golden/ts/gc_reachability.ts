// Values live across a collection.
//
// The collector is conservative: it retains whatever LOOKS like a heap address. A jsrt_value does
// not look like one -- NaN-boxing puts the tag above bit 48 -- so every reference this program
// holds is invisible unless the runtime unboxes for the collector explicitly (plan-notes 108).
// The churn loop below is the whole point: it allocates enough short-lived strings that the
// collector must run several times while `kept` and `list` are still live. If it cannot see them,
// this program prints garbage or faults; it cannot quietly pass.

const kept = new Map<string, string>();
const list: string[] = [];

for (let i = 0; i < 200; i = i + 1) {
  const key = 'key-' + i;
  // Long enough that the string is its own allocation rather than anything the runtime could be
  // storing inline, and distinctive enough that a freed-and-reused buffer would not read back.
  const value = 'value-' + i + '-long-enough-to-be-its-own-allocation';
  kept.set(key, value);
  list.push(value);
}

// Reachable only from a local, through a boxed reference, across every collection the churn causes.
const witness = 'witness-' + list.length + '-still-here';

let churned = 0;
for (let i = 0; i < 200000; i = i + 1) {
  const garbage = 'garbage-' + i + '-immediately-unreachable';
  churned = churned + garbage.length;
}

console.log(churned);
console.log(witness);
console.log(kept.size);
console.log(kept.get('key-0'));
console.log(kept.get('key-137'));
console.log(kept.get('key-199'));
console.log(list.length);
console.log(list[0]);
console.log(list[199]);

// The pending-exception cell is the one root outside the shadow stack, and this is the shape that
// proves it: `boom` builds the value and throws it, and its frame — the only one that ever held a
// reference — is popped on the way out. Through the `finally` below, which allocates freely, that
// cell is the last thing keeping the string alive.
function boom(): string {
  throw 'boom-' + list.length + '-must-survive-the-finally';
}

function unwinding(): string {
  try {
    return boom();
  } finally {
    let dropped = 0;
    for (let i = 0; i < 200000; i = i + 1) {
      const garbage = 'unwinding-' + i + '-immediately-unreachable';
      dropped = dropped + garbage.length;
    }
    console.log(dropped);
  }
}

try {
  console.log(unwinding());
} catch (e) {
  if (typeof e === 'string') {
    console.log(e);
  }
}
