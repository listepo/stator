// The global conversions and number functions called by name (plan.md §11c T11.4), against
// Node: ToString/ToNumber/ToBoolean of every primitive kind, parseInt's sign, prefix and radix
// rules (exact rounding for power-of-two radices, V8's chunked approximation for the rest),
// parseFloat's longest-prefix rule, typeof of the language's globals, Array.isArray, and the
// property name of an object binding pattern.

const vals = ["42", "  -0x1F", "0x", "", "12px", "1e3", "  3.5e2xyz", "-0", "Infinityx", "-Infinity", ".5", "5.", ".", "1e", "1e+", "08", "0b11", "  7", "z", null, undefined, true, [12, 3], {}];
for (const v of vals) {
  console.log(String(v), Number(v), Boolean(v), parseInt(v), parseFloat(v), isNaN(v), isFinite(v));
}
console.log(parseInt("ff", 16), parseInt("FF", 16), parseInt("0xff", 16), parseInt("0xff", 10), parseInt("777", 8), parseInt("z", 36), parseInt("10", 1), parseInt("10", 37), parseInt("10", 0), parseInt("11", 2.9), parseInt("123", "4"));
console.log(parseInt("1111111111111111111111111111111111111111111111111111111", 2), parseInt("fffffffffffffffffff", 16), parseInt("zzzzzzzzzzzzzzzzzzzz", 36), parseInt("12345678901234567890123", 10), parseInt("123456789012345678901234567890", 7));
console.log(parseInt("100000000000000000000000000000000000000000000000000001", 2), parseInt("1000000000000000000000000000000000000000000000000000011", 2), parseInt("20000000000001", 32));
console.log(String(), Number(), Boolean(), parseInt(), parseFloat(), isNaN(), isFinite());
console.log(typeof JSON, typeof Math, typeof String, typeof parseInt, typeof globalThis, typeof Array);
console.log(Array.isArray([1]), Array.isArray("x"), Array.isArray(), Array.isArray(JSON.parse("[1]")), Array.isArray(JSON.parse("{}")));
const { length: len } = "hello";
console.log(len, parseFloat("1.7976931348623157e309"), parseFloat("-.0"), Number("  12  "), String(-0), String(1e21), String([1, [2, 3]]));
