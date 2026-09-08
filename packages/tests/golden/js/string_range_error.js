// repeat/padStart/padEnd raise a catchable RangeError for a count or length the spec rejects,
// with Node's exact wording. The message names the ORIGINAL argument, not the truncated count.
try {
  "ab".repeat(-1);
  console.log("repeat(-1): no throw");
} catch (e) {
  if (e instanceof RangeError) {
    console.log("repeat(-1): " + e.name + ": " + e.message);
  }
}
try {
  "ab".repeat(-1.5);
} catch (e) {
  if (e instanceof RangeError) {
    console.log("repeat(-1.5): " + e.message);
  }
}
try {
  "ab".repeat(1 / 0);
} catch (e) {
  if (e instanceof RangeError) {
    console.log("repeat(Infinity): " + e.message);
  }
}
try {
  "ab".repeat(-1 / 0);
} catch (e) {
  if (e instanceof RangeError) {
    console.log("repeat(-Infinity): " + e.message);
  }
}
try {
  "ab".repeat(1099511627776);
} catch (e) {
  if (e instanceof RangeError) {
    console.log("repeat(2**40): " + e.message);
  }
}
try {
  "ab".padStart(1099511627776);
} catch (e) {
  if (e instanceof RangeError) {
    console.log("padStart: " + e.message);
  }
}
try {
  "ab".padEnd(1099511627776);
} catch (e) {
  if (e instanceof RangeError) {
    console.log("padEnd: " + e.message);
  }
}
// The valid paths still work now that each op is emitted as a checked statement.
console.log("ab".repeat(3));
console.log("5".padStart(3, "0"));
console.log("5".padEnd(3, "0"));
console.log("done");
