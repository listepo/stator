// `node:path` — Node's POSIX path functions (plan.md §11c T11.6, docs/NODE.md). Pure string
// walking over `std/env.cwd`: the answers are the pinned Node's `path.posix` answers, byte for
// byte, because Stator builds for POSIX hosts. `win32` and `matchesGlob` have not landed.

import { cwd } from 'std/env';

/** What `parse` answers and `format` reads back. */
export interface ParsedPath {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}

/** What `format` accepts: any subset of a parsed path. */
export interface FormatInputPathObject {
  root?: string;
  dir?: string;
  base?: string;
  ext?: string;
  name?: string;
}

const SLASH = 47;
const DOT = 46;

export const sep = '/';
export const delimiter = ':';

/** `path` with its `.` and `..` segments folded and its repeated slashes collapsed; `..` that
 * climbs past the start is kept when `allowAboveRoot`, else dropped. */
function __nodePathFold(path: string, allowAboveRoot: boolean): string {
  let res = '';
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code = 0;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) {
      code = path.charCodeAt(i);
    } else if (code === SLASH) {
      break;
    } else {
      code = SLASH;
    }
    if (code === SLASH) {
      if (lastSlash === i - 1 || dots === 1) {
        // An empty or `.` segment adds nothing.
      } else if (dots === 2) {
        const parentIsDotDot =
          res.length >= 2 &&
          lastSegmentLength === 2 &&
          res.charCodeAt(res.length - 1) === DOT &&
          res.charCodeAt(res.length - 2) === DOT;
        if (!parentIsDotDot && res.length > 2) {
          const lastSlashIndex = res.length - lastSegmentLength - 1;
          if (lastSlashIndex === -1) {
            res = '';
            lastSegmentLength = 0;
          } else {
            res = res.slice(0, lastSlashIndex);
            lastSegmentLength = res.length - 1 - res.lastIndexOf('/');
          }
          lastSlash = i;
          dots = 0;
          continue;
        }
        if (!parentIsDotDot && res.length !== 0) {
          res = '';
          lastSegmentLength = 0;
          lastSlash = i;
          dots = 0;
          continue;
        }
        if (allowAboveRoot) {
          res += res.length > 0 ? '/..' : '..';
          lastSegmentLength = 2;
        }
      } else {
        const segment = path.slice(lastSlash + 1, i);
        res = res.length > 0 ? `${res}/${segment}` : segment;
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === DOT && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}

/** An absolute path: the segments joined right to left until one is absolute, then the working
 * directory in front if none was, then normalized without a trailing slash. */
export function resolve(...paths: string[]): string {
  if (paths.length === 0 || (paths.length === 1 && (paths[0] === '' || paths[0] === '.'))) {
    const dir = cwd();
    if (dir.charCodeAt(0) === SLASH) {
      return dir;
    }
  }
  let resolved = '';
  let absolute = false;
  for (let i = paths.length - 1; i >= 0 && !absolute; i--) {
    const path = paths[i] ?? '';
    if (path.length === 0) {
      continue;
    }
    resolved = `${path}/${resolved}`;
    absolute = path.charCodeAt(0) === SLASH;
  }
  if (!absolute) {
    const dir = cwd();
    resolved = `${dir}/${resolved}`;
    absolute = dir.charCodeAt(0) === SLASH;
  }
  resolved = __nodePathFold(resolved, !absolute);
  if (absolute) {
    return `/${resolved}`;
  }
  return resolved.length > 0 ? resolved : '.';
}

/** `.` and `..` folded, slashes collapsed, a trailing slash kept; `''` is `.`. */
export function normalize(path: string): string {
  if (path.length === 0) {
    return '.';
  }
  const absolute = path.charCodeAt(0) === SLASH;
  const trailing = path.charCodeAt(path.length - 1) === SLASH;
  let folded = __nodePathFold(path, !absolute);
  if (folded.length === 0) {
    if (absolute) {
      return '/';
    }
    return trailing ? './' : '.';
  }
  if (trailing) {
    folded += '/';
  }
  return absolute ? `/${folded}` : folded;
}

/** Whether `path` starts at the root. */
export function isAbsolute(path: string): boolean {
  return path.length > 0 && path.charCodeAt(0) === SLASH;
}

/** The non-empty segments joined by `/`, then normalized; nothing to join is `.`. */
export function join(...paths: string[]): string {
  let joined = '';
  for (const path of paths) {
    if (path.length > 0) {
      joined = joined.length > 0 ? `${joined}/${path}` : path;
    }
  }
  return joined.length > 0 ? normalize(joined) : '.';
}

/** The path from `from` to `to`, both resolved first; the same place is `''`. */
export function relative(from: string, to: string): string {
  if (from === to) {
    return '';
  }
  const source = resolve(from);
  const target = resolve(to);
  if (source === target) {
    return '';
  }
  // Both start with `/`; compare after it.
  const fromLen = source.length - 1;
  const toLen = target.length - 1;
  const length = fromLen < toLen ? fromLen : toLen;
  let lastCommonSep = -1;
  let i = 0;
  for (; i < length; i++) {
    const code = source.charCodeAt(1 + i);
    if (code !== target.charCodeAt(1 + i)) {
      break;
    }
    if (code === SLASH) {
      lastCommonSep = i;
    }
  }
  if (i === length) {
    if (toLen > length) {
      if (target.charCodeAt(1 + i) === SLASH) {
        return target.slice(1 + i + 1);
      }
      if (i === 0) {
        return target.slice(1 + i);
      }
    } else if (fromLen > length) {
      if (source.charCodeAt(1 + i) === SLASH) {
        lastCommonSep = i;
      } else if (i === 0) {
        lastCommonSep = 0;
      }
    }
  }
  let out = '';
  for (let j = 1 + lastCommonSep + 1; j <= source.length; ++j) {
    if (j === source.length || source.charCodeAt(j) === SLASH) {
      out += out.length === 0 ? '..' : '/..';
    }
  }
  return `${out}${target.slice(1 + lastCommonSep)}`;
}

/** The path itself: namespaces are a Windows notion. */
export function toNamespacedPath(path: string): string {
  return path;
}

/** Everything before the last segment, trailing slashes ignored: `/a/b/` → `/a`, `a` → `.`. */
export function dirname(path: string): string {
  if (path.length === 0) {
    return '.';
  }
  const hasRoot = path.charCodeAt(0) === SLASH;
  let end = -1;
  let matchedSlash = true;
  for (let i = path.length - 1; i >= 1; --i) {
    if (path.charCodeAt(i) === SLASH) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      matchedSlash = false;
    }
  }
  if (end === -1) {
    return hasRoot ? '/' : '.';
  }
  if (hasRoot && end === 1) {
    return '//';
  }
  return path.slice(0, end);
}

/** The last segment, trailing slashes ignored, without `suffix` when it ends the segment and is
 * not all of it: `/a/b.txt` with `.txt` → `b`, `/` → `''`. */
export function basename(path: string, suffix?: string): string {
  let start = 0;
  let end = -1;
  let matchedSlash = true;
  if (suffix !== undefined && suffix.length > 0 && suffix.length <= path.length) {
    if (suffix === path) {
      return '';
    }
    let extIdx = suffix.length - 1;
    let firstNonSlashEnd = -1;
    for (let i = path.length - 1; i >= 0; --i) {
      const code = path.charCodeAt(i);
      if (code === SLASH) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1) {
          matchedSlash = false;
          firstNonSlashEnd = i + 1;
        }
        if (extIdx >= 0) {
          if (code === suffix.charCodeAt(extIdx)) {
            extIdx--;
            if (extIdx === -1) {
              end = i;
            }
          } else {
            extIdx = -1;
            end = firstNonSlashEnd;
          }
        }
      }
    }
    if (start === end) {
      end = firstNonSlashEnd;
    } else if (end === -1) {
      end = path.length;
    }
    return path.slice(start, end);
  }
  for (let i = path.length - 1; i >= 0; --i) {
    if (path.charCodeAt(i) === SLASH) {
      if (!matchedSlash) {
        start = i + 1;
        break;
      }
    } else if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
  }
  if (end === -1) {
    return '';
  }
  return path.slice(start, end);
}

/** Where the last segment's name, base and extension sit. `end` is -1 when the segment is empty;
 * `dot` is -1 when it has no extension (no dot, a leading dot only, or `..`). */
class __NodePathTail {
  readonly start: number;
  readonly dot: number;
  readonly end: number;
  constructor(start: number, dot: number, end: number) {
    this.start = start;
    this.dot = dot;
    this.end = end;
  }
}

/** The last segment of `path[from..]`, trailing slashes ignored. */
function __nodePathTail(path: string, from: number): __NodePathTail {
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  // 0: no dot seen yet, or only the segment's first character before it; 1: a second dot; -1: a
  // character other than a dot before the dot, so the extension is real.
  let preDotState = 0;
  for (let i = path.length - 1; i >= from; --i) {
    const code = path.charCodeAt(i);
    if (code === SLASH) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
    if (code === DOT) {
      if (startDot === -1) {
        startDot = i;
      } else if (preDotState !== 1) {
        preDotState = 1;
      }
    } else if (startDot !== -1) {
      preDotState = -1;
    }
  }
  const noExtension =
    startDot === -1 ||
    end === -1 ||
    preDotState === 0 ||
    (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1);
  return new __NodePathTail(startPart, noExtension ? -1 : startDot, end);
}

/** The last segment's extension from its last dot: `a.tar.gz` → `.gz`, `.bashrc` → `''`. */
export function extname(path: string): string {
  const tail = __nodePathTail(path, 0);
  return tail.dot === -1 ? '' : path.slice(tail.dot, tail.end);
}

/** `path` split into root, directory, base, name and extension. */
export function parse(path: string): ParsedPath {
  const ret: ParsedPath = { root: '', dir: '', base: '', ext: '', name: '' };
  if (path.length === 0) {
    return ret;
  }
  const absolute = path.charCodeAt(0) === SLASH;
  if (absolute) {
    ret.root = '/';
  }
  const tail = __nodePathTail(path, absolute ? 1 : 0);
  if (tail.end !== -1) {
    const start = tail.start === 0 && absolute ? 1 : tail.start;
    ret.base = path.slice(start, tail.end);
    if (tail.dot === -1) {
      ret.name = ret.base;
    } else {
      ret.name = path.slice(start, tail.dot);
      ret.ext = path.slice(tail.dot, tail.end);
    }
  }
  if (tail.start > 0) {
    ret.dir = path.slice(0, tail.start - 1);
  } else if (absolute) {
    ret.dir = '/';
  }
  return ret;
}

/** The inverse of `parse`: `dir` (else `root`), then `base` (else `name` + `ext`). */
export function format(pathObject: FormatInputPathObject): string {
  const root = pathObject.root ?? '';
  const dir = pathObject.dir !== undefined && pathObject.dir !== '' ? pathObject.dir : root;
  let base = pathObject.base ?? '';
  if (base === '') {
    const ext = pathObject.ext ?? '';
    const dotted = ext === '' || ext.charCodeAt(0) === DOT ? ext : `.${ext}`;
    base = `${pathObject.name ?? ''}${dotted}`;
  }
  if (dir === '') {
    return base;
  }
  return dir === root ? `${dir}${base}` : `${dir}/${base}`;
}

/** The module object: `import path from 'node:path'`, and `path.posix`, which is itself. */
export class PathModule {
  readonly sep = sep;
  readonly delimiter = delimiter;
  readonly resolve = resolve;
  readonly normalize = normalize;
  readonly isAbsolute = isAbsolute;
  readonly join = join;
  readonly relative = relative;
  readonly toNamespacedPath = toNamespacedPath;
  readonly dirname = dirname;
  readonly basename = basename;
  readonly extname = extname;
  readonly parse = parse;
  readonly format = format;
  get posix(): PathModule {
    return this;
  }
}

export const posix = new PathModule();

export default posix;
