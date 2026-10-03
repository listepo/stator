// Node's encoding names over `std/encoding` (Node v26.7.0 lib/internal/util.js
// `normalizeEncoding`, lib/buffer.js): `fs` decodes a file with them, and `Buffer` will. Spelled
// case-insensitively, as Node accepts them.

import { NodeError } from './errors.ts';
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
} from 'std/encoding';

/** The canonical name for `encoding`, or `undefined` when Node does not know it. */
export function normalizeEncoding(encoding: string): string | undefined {
  switch (encoding.toLowerCase()) {
    case 'utf8':
    case 'utf-8':
      return 'utf8';
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return 'utf16le';
    case 'latin1':
    case 'binary':
      return 'latin1';
    case 'base64':
      return 'base64';
    case 'base64url':
      return 'base64url';
    case 'hex':
      return 'hex';
    case 'ascii':
      return 'ascii';
    default:
      return undefined;
  }
}

/** Node's `ERR_INVALID_ARG_VALUE` message for an encoding it does not know. */
export function invalidEncoding(encoding: string): NodeError {
  return new NodeError(
    'TypeError',
    'ERR_INVALID_ARG_VALUE',
    `The argument 'encoding' is invalid encoding. Received '${encoding}'`,
  );
}

function utf16leText(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    text += String.fromCharCode((bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8));
  }
  return text;
}

/** Each byte with its high bit cleared, as Node's `ascii` decoder reads it. */
function sevenBit(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = (bytes[i] ?? 0) & 0x7f;
  }
  return out;
}

/** `bytes` as text in `encoding` (a canonical name from `normalizeEncoding`). */
export function decodeBytes(bytes: Uint8Array, encoding: string): string {
  switch (encoding) {
    case 'utf16le':
      return utf16leText(bytes);
    case 'latin1':
      return bytesToLatin1(bytes);
    case 'ascii':
      return bytesToLatin1(sevenBit(bytes));
    case 'base64':
      return bytesToBase64(bytes);
    case 'base64url':
      return bytesToBase64url(bytes);
    case 'hex':
      return bytesToHex(bytes);
    default:
      return bytesToUtf8(bytes);
  }
}

function utf16leBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    out[i * 2] = unit & 0xff;
    out[i * 2 + 1] = unit >> 8;
  }
  return out;
}

/** `text` as bytes in `encoding` (a canonical name from `normalizeEncoding`). */
export function encodeText(text: string, encoding: string): Uint8Array {
  switch (encoding) {
    case 'utf16le':
      return utf16leBytes(text);
    case 'latin1':
    case 'ascii':
      return latin1ToBytes(text);
    case 'base64':
      return base64ToBytes(text);
    case 'base64url':
      return base64urlToBytes(text);
    case 'hex':
      return hexToBytes(text);
    default:
      return utf8ToBytes(text);
  }
}
