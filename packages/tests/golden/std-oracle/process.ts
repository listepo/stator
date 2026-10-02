/* Node twin of packages/std/src/process.ts. `argv` drops Node's own path: Node's `argv[0]` is
 * the `node` binary and `argv[1]` the script, while a Stator program's `argv[0]` is itself. */

import { failure } from './failure.ts';

export { arch, platform } from './os.ts';

export class MemoryUsage {
  readonly rss: number;

  constructor(rss: number) {
    this.rss = rss;
  }
}

function checkStatus(call: string, code: number): void {
  if (!Number.isInteger(code) || code < 0 || code > 255) {
    throw failure(call, `${code}`, 'EINVAL');
  }
}

export function argv(): string[] {
  return process.argv.slice(1);
}

export function execPath(): string {
  return process.execPath;
}

export function exit(code: number): void {
  checkStatus('std/process.exit', code);
  process.exit(code);
}

export function exitCode(): number {
  const code = process.exitCode;
  return typeof code === 'number' ? code : Number(code ?? 0);
}

export function setExitCode(code: number): void {
  checkStatus('std/process.setExitCode', code);
  process.exitCode = code;
}

export function pid(): number {
  return process.pid;
}

export function ppid(): number {
  return process.ppid;
}

export function hrtimeNs(): number {
  return Number(process.hrtime.bigint());
}

export function memoryUsage(): MemoryUsage {
  return new MemoryUsage(process.memoryUsage.rss());
}

export function abort(): void {
  process.abort();
}
