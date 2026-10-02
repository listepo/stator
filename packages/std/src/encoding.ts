// `std/encoding` — text ↔ bytes (docs/STD.md §5): UTF-8, Latin-1, base64, base64url and hex.
// Each answer is the one Node's `Buffer` gives, because `packages/node` builds `Buffer` on these.
// Nothing throws over encoding: an invalid UTF-8 sequence decodes to U+FFFD, a lone surrogate
// encodes as U+FFFD, and the base64 and hex decoders stop or skip exactly where Node's do.
//
// Text to bytes is plain TypeScript over `charCodeAt`. Bytes to text goes through the backing
// (packages/std/zig/encoding.zig), because a string can only be made at the C-string edge.

import { jsrtStdResult } from './native/core.js';
import { jsrtStdEncodingToText } from './native/encoding.js';
import { __stdFailure } from './internal/error.ts';

/** The backing's text for `bytes` (kinds as native/encoding.d.ts numbers them). */
function __stdEncodingConvert(bytes: Uint8Array, kind: number, name: string): string {
  if (bytes.length === 0) {
    return '';
  }
  if (jsrtStdEncodingToText(kind, bytes) !== 0) {
    throw __stdFailure(`std/encoding.${name}`, '');
  }
  return jsrtStdResult();
}

/** UTF-8 or Latin-1 text for `bytes`, one NUL-free run at a time: a NUL would end the C string,
 * so each 0x00 is put back as U+0000 between runs. No multi-byte UTF-8 sequence holds a 0x00,
 * so a cut there decodes exactly as the whole would. */
function __stdEncodingRuns(bytes: Uint8Array, kind: number, name: string): string {
  let text = '';
  let start = 0;
  let index = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      text += `${__stdEncodingConvert(bytes.subarray(start, index), kind, name)}\u0000`;
      start = index + 1;
    }
    index++;
  }
  return text + __stdEncodingConvert(bytes.subarray(start), kind, name);
}

/** `text` as UTF-8; a lone surrogate becomes U+FFFD (EF BF BD). */
export function utf8ToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 3);
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        c = 0x10000 + (c - 0xd800) * 0x400 + (low - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) {
      c = 0xfffd;
    }
    if (c < 0x80) {
      out[n] = c;
      n += 1;
    } else if (c < 0x800) {
      out[n] = 0xc0 | (c >> 6);
      out[n + 1] = 0x80 | (c & 0x3f);
      n += 2;
    } else if (c < 0x10000) {
      out[n] = 0xe0 | (c >> 12);
      out[n + 1] = 0x80 | ((c >> 6) & 0x3f);
      out[n + 2] = 0x80 | (c & 0x3f);
      n += 3;
    } else {
      out[n] = 0xf0 | (c >> 18);
      out[n + 1] = 0x80 | ((c >> 12) & 0x3f);
      out[n + 2] = 0x80 | ((c >> 6) & 0x3f);
      out[n + 3] = 0x80 | (c & 0x3f);
      n += 4;
    }
  }
  return out.slice(0, n);
}

/** `bytes` decoded as UTF-8; each maximal invalid subsequence becomes one U+FFFD. */
export function bytesToUtf8(bytes: Uint8Array): string {
  return __stdEncodingRuns(bytes, 0, 'bytesToUtf8');
}

/** Each UTF-16 code unit's low byte (Node's `latin1`/`binary`). */
export function latin1ToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) & 0xff;
  }
  return out;
}

/** Each byte as the code point of the same value. */
export function bytesToLatin1(bytes: Uint8Array): string {
  return __stdEncodingRuns(bytes, 1, 'bytesToLatin1');
}

/** The value of a base64 digit in either alphabet (`+`/`/` or `-`/`_`), else -1. */
function __stdBase64Digit(c: number): number {
  if (c >= 0x41 && c <= 0x5a) {
    return c - 0x41;
  }
  if (c >= 0x61 && c <= 0x7a) {
    return c - 0x61 + 26;
  }
  if (c >= 0x30 && c <= 0x39) {
    return c - 0x30 + 52;
  }
  if (c === 0x2b || c === 0x2d) {
    return 62;
  }
  if (c === 0x2f || c === 0x5f) {
    return 63;
  }
  return -1;
}

/** Node's lenient base64 decoder: either alphabet, any other character skipped, the first `=`
 * ends the input, and a final group of two or three digits gives one or two bytes. */
export function base64ToBytes(text: string): Uint8Array {
  const out = new Uint8Array(Math.floor((text.length * 3) / 4) + 2);
  let n = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x3d) {
      break;
    }
    const digit = __stdBase64Digit(c);
    if (digit < 0) {
      continue;
    }
    acc = ((acc << 6) | digit) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n] = (acc >> bits) & 0xff;
      n += 1;
    }
  }
  return out.slice(0, n);
}

/** The same decoder as `base64ToBytes`: Node reads both alphabets under either name. */
export function base64urlToBytes(text: string): Uint8Array {
  return base64ToBytes(text);
}

/** Standard base64 with `=` padding. */
export function bytesToBase64(bytes: Uint8Array): string {
  return __stdEncodingConvert(bytes, 2, 'bytesToBase64');
}

/** URL-safe base64 (`-`, `_`), unpadded. */
export function bytesToBase64url(bytes: Uint8Array): string {
  return __stdEncodingConvert(bytes, 3, 'bytesToBase64url');
}

function __stdHexDigit(c: number): number {
  if (c >= 0x30 && c <= 0x39) {
    return c - 0x30;
  }
  if (c >= 0x61 && c <= 0x66) {
    return c - 0x61 + 10;
  }
  if (c >= 0x41 && c <= 0x46) {
    return c - 0x41 + 10;
  }
  return -1;
}

/** Node's hex decoder: pairs of digits (either case) up to the first pair that is not one; an
 * odd last digit is dropped. */
export function hexToBytes(text: string): Uint8Array {
  const pairs = Math.floor(text.length / 2);
  const out = new Uint8Array(pairs);
  let n = 0;
  while (n < pairs) {
    const high = __stdHexDigit(text.charCodeAt(2 * n));
    const low = __stdHexDigit(text.charCodeAt(2 * n + 1));
    if (high < 0 || low < 0) {
      break;
    }
    out[n] = high * 16 + low;
    n += 1;
  }
  return out.slice(0, n);
}

/** Lower-case hex, two digits per byte. */
export function bytesToHex(bytes: Uint8Array): string {
  return __stdEncodingConvert(bytes, 4, 'bytesToHex');
}
