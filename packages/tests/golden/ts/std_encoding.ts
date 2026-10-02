// `std/encoding` (docs/STD.md §5): text ↔ bytes against Node's `Buffer` — valid and invalid UTF-8,
// lone surrogates, NULs, Latin-1 truncation, and the base64 and hex decoders' leniency.
import {
  base64ToBytes,
  base64urlToBytes,
  bytesToBase64,
  bytesToBase64url,
  bytesToHex,
  bytesToLatin1,
  bytesToUtf8,
  hexToBytes,
  latin1ToBytes,
  utf8ToBytes,
} from "std/encoding";

const texts = ["", "abc", "héllo wörld", "✓ €", "😀 x 𝄞", "a\u0000b\u0000", "\ud800", "x\udc00y", "􏿿"];
for (const text of texts) {
  const utf8 = utf8ToBytes(text);
  console.log(JSON.stringify(text), bytesToHex(utf8), JSON.stringify(bytesToUtf8(utf8)));
  const latin1 = latin1ToBytes(text);
  console.log("  latin1", bytesToHex(latin1), JSON.stringify(bytesToLatin1(latin1)));
  console.log("  base64", bytesToBase64(utf8), bytesToBase64url(utf8));
}

const invalid = [
  "80", "c0", "c080", "c1bf", "e282", "e2", "e228a1", "ed a080", "eda080", "f4908080", "f0908d", "f8888080",
  "ff", "fe ff", "61ff62", "00", "e2820061", "f09f9880", "efbbbf61",
];
for (const hex of invalid) {
  console.log(hex, JSON.stringify(bytesToUtf8(hexToBytes(hex))), JSON.stringify(bytesToLatin1(hexToBytes(hex))));
}

const encoded = [
  "QUJD", "QUJ", "QU", "Q", "QUJDRA==", "QUJDRA", "QU JD\nRA", "QUJD=RA==", "QUJD RA=x", "-_-_", "+/+/",
  "QU!JD", "Q=UJD", "=QUJD", "QUJDR", "QUJDRA=", "QQ==QQ==", "\u0000QUJD", "QéUJD", "QUJD====RA", "",
];
for (const text of encoded) {
  console.log(JSON.stringify(text), bytesToHex(base64ToBytes(text)), bytesToHex(base64urlToBytes(text)));
}

for (const text of ["0a1B", "0a1", "0g12", "g0", "", "0a 1b", "ab\u0000c", "FFfe00"]) {
  console.log(JSON.stringify(text), bytesToHex(hexToBytes(text)));
}

const all = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  all[i] = i;
}
console.log(bytesToBase64(all));
console.log(bytesToBase64url(all));
console.log(bytesToHex(all));
console.log(bytesToHex(utf8ToBytes(bytesToLatin1(all))));
console.log(bytesToHex(base64ToBytes(bytesToBase64(all))) === bytesToHex(all));
