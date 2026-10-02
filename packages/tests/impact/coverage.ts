/* V8 coverage → line spans (plan.md §9 Task 6.17).
 *
 * Both recorders speak V8's `ScriptCoverage`: the in-process one through
 * `Profiler.takePreciseCoverage`, the per-process one through the files `NODE_V8_COVERAGE`
 * writes. Only each function's own range is read (`ranges[0]`): the block ranges after it are
 * branch detail the selection does not use. Offsets become 1-based lines on the file text as it
 * is on disk now — the recording run never edits the tree, so that is the map commit's text.
 */
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Span } from '../support/impact.ts';

/** One file's functions in one coverage snapshot. */
export interface FileCoverage {
  readonly path: string;
  /** Every function reported, executed or not (the module body excluded). */
  readonly all: readonly Span[];
  /** Functions with a nonzero count in this snapshot. */
  readonly executed: readonly Span[];
  /** The module body ran in this snapshot: the file loaded here. */
  readonly rootRan: boolean;
}

export interface CoverageSnapshot {
  readonly files: readonly FileCoverage[];
  /** `npm:<name>` for every package with code that ran. */
  readonly packages: readonly string[];
}

const SCRIPT = /\.(?:[cm]?ts|[cm]?js)$/;

/** Where the recorder's own code lives: excluded, it does not change what a test does. */
const EXCLUDED_PREFIXES = ['packages/tests/impact/'];

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) {
    starts.push(at + 1);
  }
  return starts;
}

function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

function packageOf(path: string): string | undefined {
  const at = path.lastIndexOf('node_modules/');
  if (at < 0) return undefined;
  const rest = path.slice(at + 'node_modules/'.length).split('/');
  const [first, second] = rest;
  if (first === undefined) return undefined;
  return first.startsWith('@') && second !== undefined ? `${first}/${second}` : first;
}

interface RawRange {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly count: number;
}

function functionRange(fn: unknown): { name: string; range: RawRange } | undefined {
  if (typeof fn !== 'object' || fn === null || !('ranges' in fn) || !Array.isArray(fn.ranges)) {
    return undefined;
  }
  const first: unknown = fn.ranges[0];
  if (
    typeof first !== 'object' ||
    first === null ||
    !('startOffset' in first) ||
    !('endOffset' in first) ||
    !('count' in first) ||
    typeof first.startOffset !== 'number' ||
    typeof first.endOffset !== 'number' ||
    typeof first.count !== 'number'
  ) {
    return undefined;
  }
  const name = 'functionName' in fn && typeof fn.functionName === 'string' ? fn.functionName : '';
  return {
    name,
    range: { startOffset: first.startOffset, endOffset: first.endOffset, count: first.count },
  };
}

/** A recorder converts many snapshots of the same files: cache their line tables. */
export class CoverageConverter {
  private readonly starts = new Map<string, number[] | null>();
  private readonly repo: string;
  private readonly read: (path: string) => string;

  constructor(repo: string, read: (path: string) => string = (path) => readFileSync(path, 'utf8')) {
    this.repo = repo;
    this.read = read;
  }

  /** Repo-relative path for a `file:` URL inside the repo, else `undefined`. */
  repoPath(url: string): string | undefined {
    if (!url.startsWith('file:')) return undefined;
    let abs: string;
    try {
      abs = fileURLToPath(url);
    } catch {
      return undefined;
    }
    const rel = relative(this.repo, abs).split(sep).join('/');
    if (rel.startsWith('../') || rel === '..' || rel.includes('node_modules/')) return undefined;
    return rel;
  }

  private lines(abs: string): number[] | undefined {
    let starts = this.starts.get(abs);
    if (starts === undefined) {
      try {
        starts = lineStarts(this.read(abs));
      } catch {
        starts = null;
      }
      this.starts.set(abs, starts);
    }
    return starts ?? undefined;
  }

  convert(result: readonly unknown[]): CoverageSnapshot {
    const files: FileCoverage[] = [];
    const packages = new Set<string>();
    for (const script of result) {
      if (typeof script !== 'object' || script === null || !('url' in script)) continue;
      if (typeof script.url !== 'string' || !('functions' in script)) continue;
      const functions: unknown = script.functions;
      if (!Array.isArray(functions)) continue;
      const url = script.url;
      if (url.includes('/node_modules/')) {
        const name = packageOf(url);
        const ran = functions.some((fn: unknown) => (functionRange(fn)?.range.count ?? 0) > 0);
        if (name !== undefined && ran) packages.add(`npm:${name}`);
        continue;
      }
      const path = this.repoPath(url);
      if (path === undefined || !SCRIPT.test(path)) continue;
      if (EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
      const starts = this.lines(fileURLToPath(url));
      if (starts === undefined) continue;
      const all: Span[] = [];
      const executed: Span[] = [];
      let rootRan = false;
      for (const fn of functions) {
        const parsed = functionRange(fn);
        if (parsed === undefined) continue;
        const { name, range } = parsed;
        if (name === '' && range.startOffset === 0) {
          // The module body: it spans the whole file, so it is the "loaded" signal, not a span.
          rootRan = rootRan || range.count > 0;
          continue;
        }
        const span: Span = [
          lineAt(starts, range.startOffset),
          lineAt(starts, Math.max(range.startOffset, range.endOffset - 1)),
        ];
        all.push(span);
        if (range.count > 0) executed.push(span);
      }
      files.push({ path, all, executed, rootRan });
    }
    return { files, packages: [...packages] };
  }
}
