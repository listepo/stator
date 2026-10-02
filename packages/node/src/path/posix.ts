// `node:path/posix` — the same module object as `node:path` (plan.md §11c T11.6): Stator builds
// for POSIX hosts, so `path.posix` is `path` itself, exactly as on the pinned Node there.

export * from '../path.ts';
export { default } from '../path.ts';
