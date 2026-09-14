// strstr through the extern surface (docs/FFI.md, plan.md section 10 Task 7.1 steps 4–5):
// the two-CString-in, one-CString-out shape — direct C calls, borrowed arguments freed
// after the call, the library's return pointer copied out at the boundary, against the
// pinned Node byte-for-byte. strstr returns a pointer INTO the haystack (never malloc'd),
// so the plain variant is leak-free; a miss returns NULL, which belongs to the
// `@statorError null` convention — only the checked variant takes that path.
/// <reference path="./libc.d.ts" />

console.log(strstr2("hello world" as CString, "world" as CString));
console.log(strstr2("hello world" as CString, "hello" as CString));
console.log(strstr2("hello world" as CString, "" as CString));
console.log(strstrChecked("hello world" as CString, "world" as CString));
try {
  strstrChecked("hello world" as CString, "xyz" as CString);
  console.log("strstrChecked-miss: no throw");
} catch (e) {
  if (e instanceof Error) {
    console.log("caught: " + e.message);
  }
}
export {};
