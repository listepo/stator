// `std/path` — POSIX path strings (docs/STD.md §5). Pure string walking in TypeScript: no
// file-system access and no backing, so the module needs nothing from `libjsrt_std.a` and its
// answers are the same on every machine.
//
// The semantics are POSIX `basename(3)` / `dirname(3)`, not Node's `path.posix`: trailing
// slashes are ignored (`/a/b/` names `b`), the root names itself (`basename('/')` is `/`, where
// Node answers ''), and nothing is normalized — `.` and `..` are ordinary segments. `join` takes
// exactly two segments: an absolute second segment wins, otherwise the two meet at one `/`.

/** Whether `path` starts at the root. */
export function isAbsolute(path: string): boolean {
  return path.startsWith('/');
}

/** `path` without its trailing slashes, except that the root keeps its one. */
function __stdPathTrimEnd(path: string): string {
  let end = path.length;
  while (end > 1 && path.charAt(end - 1) === '/') {
    end--;
  }
  return path.slice(0, end);
}

/** The last segment: `/a/b/c.txt` → `c.txt`, `/a/b/` → `b`, `/` → `/`, `` → ``. */
export function basename(path: string): string {
  const trimmed = __stdPathTrimEnd(path);
  if (trimmed === '/') {
    return '/';
  }
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

/** Everything before the last segment: `/a/b/c.txt` → `/a/b`, `a.txt` → `.`, `/` → `/`. */
export function dirname(path: string): string {
  const trimmed = __stdPathTrimEnd(path);
  let slash = trimmed.lastIndexOf('/');
  if (slash < 0) {
    return '.';
  }
  while (slash > 0 && trimmed.charAt(slash - 1) === '/') {
    slash--;
  }
  return slash === 0 ? '/' : trimmed.slice(0, slash);
}

/** `a` and `b` joined by exactly one `/`; an absolute `b` is the answer by itself. */
export function join(a: string, b: string): string {
  if (b.startsWith('/')) {
    return b;
  }
  let end = a.length;
  while (end > 0 && a.charAt(end - 1) === '/') {
    end--;
  }
  let start = 0;
  while (start < b.length && b.charAt(start) === '/') {
    start++;
  }
  return `${a.slice(0, end)}/${b.slice(start)}`;
}
