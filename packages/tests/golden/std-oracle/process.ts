/* Node twin of packages/std/src/process.ts. */

import { failure } from './failure.ts';

export function exit(code: number): void {
  if (!Number.isInteger(code) || code < 0 || code > 255) {
    throw failure('std/process.exit', `${code}`, 'EINVAL');
  }
  process.exit(code);
}

export function pid(): number {
  return process.pid;
}

export function abort(): void {
  process.abort();
}
