/* Which runtime sources a linked binary can run (plan.md §9 Task 6.17, plan-notes 293).
 *
 * Programs link `libjsrt.a` with `-dead_strip` / `--gc-sections`, so the binary's defined
 * symbols name exactly what survived. A member is linked when any of its defined globals is in
 * the binary; each linked member expands to the sources and headers its `-MMD` sidecar lists.
 * `jsrt_zig.o` has no sidecar (Zig's cache tracks its inputs), so it stands for every `.zig` and
 * every header. Anything that cannot be resolved answers `*` — "assume all of it".
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

export type Exec = (command: string, args: readonly string[]) => string;

const defaultExec: Exec = (command, args) =>
  execFileSync(command, [...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

interface ArchiveIndex {
  readonly key: string;
  /** Defined global symbol → member file name. */
  readonly owner: ReadonlyMap<string, string>;
}

/** `nm -A` prints `archive:member: addr T sym` (llvm) or `archive:member:addr T sym` (GNU). */
const MEMBER_LINE = /^.*:([^:\s]+\.o):\s*(?:[0-9a-fA-F]+\s+)?[A-Za-z]\s+(\S+)$/;
const SYMBOL_LINE = /^(?:[0-9a-fA-F]+\s+)?[A-Za-z]\s+(\S+)$/;

function toRepo(repo: string, abs: string): string | undefined {
  const rel = relative(repo, abs).split(sep).join('/');
  return rel.startsWith('..') ? undefined : rel;
}

export class NativeResolver {
  private archive: ArchiveIndex | undefined;
  private readonly depCache = new Map<string, readonly string[]>();

  private readonly repo: string;
  private readonly exec: Exec;
  private readonly read: (path: string) => string;

  constructor(
    repo: string,
    exec: Exec = defaultExec,
    read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
  ) {
    this.repo = repo;
    this.exec = exec;
    this.read = read;
  }

  private index(libDir: string): ArchiveIndex {
    const path = join(libDir, 'libjsrt.a');
    const key = `${path}@${String(statSync(path).mtimeMs)}`;
    if (this.archive?.key === key) return this.archive;
    const owner = new Map<string, string>();
    for (const line of this.exec('nm', ['-A', '-g', '--defined-only', path]).split('\n')) {
      const match = MEMBER_LINE.exec(line.trim());
      if (match?.[1] !== undefined && match[2] !== undefined) owner.set(match[2], match[1]);
    }
    this.depCache.clear();
    this.archive = { key, owner };
    return this.archive;
  }

  private zigInputs(): string[] {
    const runtime = join(this.repo, 'packages', 'runtime');
    const out: string[] = [];
    for (const dir of ['src', 'include']) {
      for (const name of readdirSync(join(runtime, dir))) {
        if (name.endsWith('.zig') || name.endsWith('.h'))
          out.push(`packages/runtime/${dir}/${name}`);
      }
    }
    return out;
  }

  /** The repo-relative sources and headers one member depends on, from its `-MMD` sidecar. */
  memberSources(libDir: string, member: string): readonly string[] {
    const cached = this.depCache.get(member);
    if (cached !== undefined) return cached;
    let deps: string[];
    if (member === 'jsrt_zig.o') {
      deps = this.zigInputs();
    } else {
      const sidecar = join(libDir, member.replace(/\.o$/, '.d'));
      if (!existsSync(sidecar)) {
        deps = ['*'];
      } else {
        const runtime = join(this.repo, 'packages', 'runtime');
        deps = [];
        for (const line of this.read(sidecar).split('\n')) {
          const body = line.replace(/^[^:]*:/, '').replaceAll('\\', ' ');
          for (const token of body.split(/\s+/)) {
            if (token === '') continue;
            const rel = toRepo(this.repo, isAbsolute(token) ? token : join(runtime, token));
            if (rel !== undefined) deps.push(rel);
          }
        }
      }
    }
    const unique = [...new Set(deps)].sort();
    this.depCache.set(member, unique);
    return unique;
  }

  /** Runtime files a binary linked against `libDir/libjsrt.a` can run, or `['*']`. */
  linked(binary: string, libDir: string): readonly string[] {
    try {
      const { owner } = this.index(libDir);
      const members = new Set<string>();
      for (const line of this.exec('nm', ['-g', '--defined-only', binary]).split('\n')) {
        const match = SYMBOL_LINE.exec(line.trim());
        const member = match?.[1] === undefined ? undefined : owner.get(match[1]);
        if (member !== undefined) members.add(member);
      }
      const files = new Set<string>();
      for (const member of members) {
        for (const file of this.memberSources(libDir, member)) files.add(file);
      }
      return files.has('*') ? ['*'] : [...files].sort();
    } catch {
      return ['*'];
    }
  }
}

/** The link a spawned command performs, if it links the runtime: `-ljsrt` with `-L dir` and
 * `-o out`. `undefined` when it does not link it; `'*'` when it does but cannot be traced. */
export function runtimeLink(
  args: readonly string[],
): { readonly out: string; readonly libDir: string } | '*' | undefined {
  if (!args.some((arg) => arg === '-ljsrt' || arg.endsWith('libjsrt.a'))) return undefined;
  let out: string | undefined;
  const libDirs: string[] = [];
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    if (arg === '-o') out = args[at + 1];
    else if (arg === '-L' && args[at + 1] !== undefined) libDirs.push(args[at + 1] ?? '');
    else if (arg !== undefined && arg.startsWith('-L') && arg.length > 2)
      libDirs.push(arg.slice(2));
  }
  const libDir = libDirs.find((dir) => existsSync(join(dir, 'libjsrt.a')));
  return out === undefined || libDir === undefined ? '*' : { out, libDir };
}
