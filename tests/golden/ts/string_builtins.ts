// String.prototype (Task 4.2): UTF-16 code-unit semantics, aimed at the spec corners --
// negative and out-of-range indices, substring swapping a backwards pair, empty-separator and
// empty-string splits, and GetSubstitution ($$, $&, $`, $') in string replacements.

const s: string = "Hello, World";
console.log(s.charAt(1));
console.log(s.charAt(-1));
console.log(s.charCodeAt(0));
console.log(s.charCodeAt(99));
console.log(s.indexOf("o"));
console.log(s.indexOf("o", 5));
console.log(s.lastIndexOf("o"));
console.log(s.indexOf("xyz"));
console.log(s.includes("World"));
console.log(s.startsWith("Hell"));
console.log(s.endsWith("ld"));
console.log(s.endsWith("Hello", 5));
console.log(s.slice(7));
console.log(s.slice(-5));
console.log(s.slice(1, -1));
console.log(s.substring(3, 1));
console.log("  pad  ".trim());
console.log("  pad  ".trimStart());
console.log("  pad  ".trimEnd());
console.log("ab".repeat(3));
console.log("ab".repeat(0));
console.log("5".padStart(3, "0"));
console.log("5".padEnd(4, "-!"));
console.log("x".padStart(2));
console.log("a,b,,c".split(","));
console.log("abc".split(""));
console.log("".split(","));
console.log("".split(""));
console.log("aaa".split("aa"));
console.log("a-b-c".replace("-", "+"));
console.log("a-b-c".replaceAll("-", "+"));
console.log("abc".replace("b", "[$&]"));
console.log("abc".replace("b", "$`|$'"));
console.log("cost: $5".replace("$5", "$$9"));
console.log("MiXeD".toUpperCase());
console.log("MiXeD".toLowerCase());
console.log("a".repeat(2).indexOf("a", 1));
console.log("xyx".replaceAll("x", "$&$&"));
console.log("abc".replaceAll("", "-"));
