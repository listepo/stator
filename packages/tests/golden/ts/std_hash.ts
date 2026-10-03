// `std/hash` (docs/STD.md §5): SHA-256, SHA-1 and MD5 against `node:crypto`, over bytes and over
// text (hashed as its UTF-8, NULs and lone surrogates included). `randomBytes` is checked only for
// its shape here — its values are proved by unit/std.test.ts ranges.
import { bytesToHex } from "std/encoding";
import { md5, randomBytes, sha1, sha256 } from "std/hash";

const inputs = ["", "abc", "The quick brown fox jumps over the lazy dog", "héllo ✓ 😀", "a\u0000b", "\ud800"];
for (const text of inputs) {
  console.log(JSON.stringify(text));
  console.log("  sha256", bytesToHex(sha256(text)));
  console.log("  sha1  ", bytesToHex(sha1(text)));
  console.log("  md5   ", bytesToHex(md5(text)));
}

const million = new Uint8Array(1000000);
for (let i = 0; i < million.length; i++) {
  million[i] = i & 0xff;
}
console.log(bytesToHex(sha256(million)), bytesToHex(sha1(million)), bytesToHex(md5(million)));
console.log(bytesToHex(sha256(new Uint8Array([0, 255, 0]))), sha256(new Uint8Array(0)).length);

console.log(randomBytes(0).length, randomBytes(16).length, randomBytes(70000).length);
for (const size of [-1, 1.5, NaN, 2147483648]) {
  try {
    randomBytes(size);
    console.log(size, "no error");
  } catch (e) {
    if (e instanceof Error) {
      console.log(e.message);
    }
  }
}
