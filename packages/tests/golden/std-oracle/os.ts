/* Node twin of packages/std/src/os.ts: `node:os` and `process` answer for the same machine. */

import {
  availableParallelism,
  homedir as nodeHomedir,
  hostname as nodeHostname,
  release as nodeRelease,
  tmpdir as nodeTmpdir,
  totalmem,
} from 'node:os';

export const eol: string = '\n';

export function platform(): string {
  return process.platform;
}

export function arch(): string {
  return process.arch;
}

export function release(): string {
  return nodeRelease();
}

export function hostname(): string {
  return nodeHostname();
}

export function homedir(): string {
  return nodeHomedir();
}

export function tmpdir(): string {
  return nodeTmpdir();
}

export function cpuCount(): number {
  return availableParallelism();
}

export function totalMemory(): number {
  return totalmem();
}
