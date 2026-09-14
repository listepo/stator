// The Node half of print_extern.c — the same successful conversions, in the same order.
// Non-ASCII is spelled with \u escapes so the file's own encoding can never drift the bytes.
console.log(0);
console.log(42);
console.log(-42);
console.log(2147483647);
console.log(-2147483648);
console.log("hello");
console.log("h\u00e9llo");
console.log("\u65e5\u672c\u8a9e");
console.log("emoji: \u{1f409}");
console.log("ab");
