/* Node twin of packages/std/src/time.ts. */

import { failure } from './failure.ts';

export function nowMs(): number {
  return Date.now();
}

export function sleepMs(ms: number): void {
  if (!(ms >= 0 && ms <= 2147483647)) {
    throw failure('std/time.sleepMs', `${ms}`, 'EINVAL');
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.trunc(ms));
}
