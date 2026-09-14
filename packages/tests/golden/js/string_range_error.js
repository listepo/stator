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
// The cap is Node's maximum string length, 2^29-24 (536870888): each length below
// exceeds it yet would fit under 2^31-1, and throws without allocating.
try {
  "ab".repeat(300000000);
  console.log("repeat(300000000): no throw");
} catch (e) {
  if (e instanceof RangeError) {
    console.log("repeat(300000000): " + e.message);
  }
}
try {
  "ab".repeat(268435445);
} catch (e) {
  if (e instanceof RangeError) {
    console.log("repeat(268435445): " + e.message);
  }
}
try {
  "a".repeat(536870889);
} catch (e) {
  if (e instanceof RangeError) {
    console.log("repeat(536870889): " + e.message);
  }
}
try {
  "ab".padStart(536870889);
} catch (e) {
  if (e instanceof RangeError) {
    console.log("padStart(536870889): " + e.message);
  }
}
try {
  "ab".padEnd(536870889);
} catch (e) {
  if (e instanceof RangeError) {
    console.log("padEnd(536870889): " + e.message);
  }
}
// An explicitly empty filler returns the string before the cap check, and an empty
// receiver never exceeds it — both answer without throwing, as in Node.
console.log("ab".padStart(536870889, ""));
console.log("ab".padStart(3000000000, ""));
console.log("ab".padEnd(3000000000, ""));
console.log("empty: [" + "".repeat(536870889) + "]");
// The valid paths still work now that each op is emitted as a checked statement.
console.log("ab".repeat(3));
console.log("5".padStart(3, "0"));
console.log("5".padEnd(3, "0"));
console.log("done");
