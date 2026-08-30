// String.prototype in js mode: the receiver's type is inferred from the literal, so the same
// closed-set ops land with no annotation anywhere.

const s = "Hello, World";
console.log(s.charAt(4));
console.log(s.charCodeAt(0));
console.log(s.indexOf("o", 5));
console.log(s.lastIndexOf("o"));
console.log(s.includes("World"));
console.log(s.startsWith("Hello"));
console.log(s.endsWith("Hello", 5));
console.log(s.slice(1, -1));
console.log(s.substring(3, 1));
console.log("a,b,,c".split(","));
console.log("abc".split(""));
console.log("a-b-c".replaceAll("-", "+"));
console.log("abc".replace("b", "[$&]"));
console.log("5".padStart(3, "0"));
console.log("5".padEnd(3, "0"));
console.log("  pad  ".trim());
console.log("  pad  ".trimStart());
console.log("  pad  ".trimEnd());
console.log("MiXeD".toLowerCase());
console.log("MiXeD".toUpperCase());
console.log("ab".repeat(3));
