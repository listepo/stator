/* Node twin of packages/std/src/encoding.ts: every conversion is `Buffer`'s, answered as a plain
 * `Uint8Array` (a `Buffer` prints differently). */

function bytes(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length).slice();
}

function text(data: Uint8Array, encoding: BufferEncoding): string {
  return Buffer.from(data.buffer, data.byteOffset, data.length).toString(encoding);
}

export function utf8ToBytes(value: string): Uint8Array {
  return bytes(Buffer.from(value, 'utf8'));
}

export function bytesToUtf8(data: Uint8Array): string {
  return text(data, 'utf8');
}

export function latin1ToBytes(value: string): Uint8Array {
  return bytes(Buffer.from(value, 'latin1'));
}

export function bytesToLatin1(data: Uint8Array): string {
  return text(data, 'latin1');
}

export function base64ToBytes(value: string): Uint8Array {
  return bytes(Buffer.from(value, 'base64'));
}

export function base64urlToBytes(value: string): Uint8Array {
  return bytes(Buffer.from(value, 'base64url'));
}

export function bytesToBase64(data: Uint8Array): string {
  return text(data, 'base64');
}

export function bytesToBase64url(data: Uint8Array): string {
  return text(data, 'base64url');
}

export function hexToBytes(value: string): Uint8Array {
  return bytes(Buffer.from(value, 'hex'));
}

export function bytesToHex(data: Uint8Array): string {
  return text(data, 'hex');
}
