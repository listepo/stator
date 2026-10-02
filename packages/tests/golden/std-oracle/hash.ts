/* Node twin of packages/std/src/hash.ts: `node:crypto` digests and `randomBytes`, answered as a
 * plain `Uint8Array`. */

import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto';
import { failure } from './failure.ts';

function digest(algorithm: string, data: Uint8Array | string): Uint8Array {
  return new Uint8Array(createHash(algorithm).update(data).digest());
}

export function sha256(data: Uint8Array | string): Uint8Array {
  return digest('sha256', data);
}

export function sha1(data: Uint8Array | string): Uint8Array {
  return digest('sha1', data);
}

export function md5(data: Uint8Array | string): Uint8Array {
  return digest('md5', data);
}

export function randomBytes(size: number): Uint8Array {
  if (!Number.isInteger(size) || size < 0 || size > 2147483647) {
    throw failure('std/hash.randomBytes', `${size}`, 'EINVAL');
  }
  return new Uint8Array(nodeRandomBytes(size));
}
