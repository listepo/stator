// for-of over a string yields code points, not UTF-16 units (String.prototype[@@iterator]).
const ascii = "ab";
for (const c of ascii) {
  console.log(c);
}
const empty = "";
for (const c of empty) {
  console.log("empty");
}
const emoji = "a👍b";
for (const c of emoji) {
  console.log(c.length);
}
