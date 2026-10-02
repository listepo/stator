// Number.prototype.toString(radix) and toFixed(digits), and Number.parseInt/parseFloat, in ts
// mode (plan.md §11c T11.4, plan-notes 310).

function hex(byte: number): string {
  const digits = byte.toString(16);
  return digits.length === 1 ? `0${digits}` : digits;
}

const bytes: number[] = [0, 7, 15, 16, 200, 255];
console.log(bytes.map(hex).join(""));

const ms: number = 1234.5678;
console.log(`${(ms / 1e3).toFixed(2)}s`, ms.toFixed(), (-ms).toFixed(1));
console.log((0.1 + 0.2).toString(2));
console.log(Number.parseInt("0x1f"), Number.parseFloat("-.5e1"));
const limit: number = Number.MAX_SAFE_INTEGER;
console.log(limit + 2, Number.EPSILON > 0, Number.NEGATIVE_INFINITY < -Number.MAX_VALUE);

try {
  ms.toFixed(-1);
} catch (e) {
  console.log(e instanceof RangeError);
}
