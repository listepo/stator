# Research: `--node`, the Node platform (plan.md §11c, T11.0)

Status: **decided** (plan-notes 288): go P0 + N1, defer N2, no N3; `--node` is a platform flag;
`std` backings and the event loop are written in **Zig** (an own loop, not libuv — §4.3's
recommendation was not taken); `node:*` modules are written from scratch (no vendored Node JS).
This file is the research record, not normative — `plan.md` §11c is.

Checked 2026-10-02. Every fact carries its primary source. Facts with no primary source are marked
**unverified**. Lines marked *synthesis* are this document's own reasoning, not a source's.

Corpus measurements are in [`node-mode/scan.md`](node-mode/scan.md). The raw counts are in
`node-mode/scan.json`, produced by [`node-mode/scan.ts`](node-mode/scan.ts) on Node 26.7.0, the
pinned oracle.

## 0. Answer in one screen

- **Two layers, `std` first** (the creator's constraint, 2026-10-02):
  - `std/*` is Stator's own typed systems library, backed by C.
  - `node:*` modules are ordinary Stator TypeScript modules written over `std`. They contain no C
    of their own.
  - Node semantics live only in the wrapper layer: error codes, EventEmitter, stream state
    machines, the `exports` object, legacy aliases. `std` stays POSIX-shaped, as `docs/STD.md` §7
    already demands.
- **`--node` is a platform flag, not a third mode.** It decides three things:
  - which module specifiers resolve: `node:*`, bare built-ins, CommonJS `require`;
  - which globals exist: `process`, `Buffer`, timers, `__dirname`;
  - whether a macrotask loop runs after `main`.
  The `ts`/`js` mode gate is unchanged. Everything below the gate sees ordinary modules and
  ordinary calls, so plan §0.8 holds.
- **The blocker is not Node.** On TypeScript 6.0.3's `tsc`, the Node surface is 47 checker errors.
  js-mode coverage is 1 575 `STA1214` sites, and there is a `STA4072` crash (plan-notes 286).
  Two prerequisites the plan does not yet have are bigger than any `node:*` module:
  - the typed-array family (`Uint8Array`, `ArrayBuffer`), which `Buffer` is built on;
  - a real `std/*` import edge. Today `std/env` and `std/path` are golden fixtures over
    `declare` externs (plan-notes 284), not an importable package.
- **Recommendation:**
  - **Go** for slice N1: sync `tsc` on a small project. Gate it on the prerequisites in §7.
  - **Defer** N2: event loop, child processes, streams.
  - **No-go for now** on N3: net, http, tls, zlib, worker_threads, vm.
  §8 gives the reasons.

## 1. What real programs use (measured)

Corpus: 12 npm packages from this repo's own install. The scanner reads every `.js`/`.cjs`/`.mjs`
file with the `typescript` parser, with no type check. Package versions are recorded in
`scan.md`. Totals across the corpus:

- 36 distinct built-in modules.
- One computed `require(expr)`: tsc's plugin loader.
- `process` is used in all 12 packages.

| Built-in | Packages (of 12) | What is actually used |
| --- | --- | --- |
| `path` | 10 | `resolve`, `dirname`, `join`, `posix`, `relative`, `isAbsolute`, `extname`, `basename` |
| `fs` | 9 | `readFileSync`, `existsSync`, `statSync`, `realpathSync`, `writeSync`, `writeFileSync`, `promises`, `readdirSync`, `mkdirSync` |
| `url` | 9 | `fileURLToPath`, `pathToFileURL`, `URL` |
| `util` | 8 | `inspect`, `stripVTControlCharacters`, `callbackify`, `debuglog`, `format`, `promisify` |
| `os` | 7 | `availableParallelism`, `cpus`, `homedir`, `tmpdir`, `EOL`, `platform` |
| `events` | 5 | `once`, `EventEmitter`, `on` |
| `child_process` | 5 | `spawn`, `execFile`, `fork`, `spawnSync` |
| `perf_hooks` | 5 | `performance` (`now`) |
| `module` | 4 | `createRequire`, `isBuiltin`, `builtinModules` |
| `worker_threads`, `crypto`, `stream`, `tty`, `buffer`, `assert`, `fs/promises` | 3–4 each | see `scan.md` |
| `http`, `https`, `net`, `tls`, `zlib`, `vm`, `v8`, `inspector`, `dns`, `http2` | 1–3 each | bundlers and test runners only (vite, vitest, ws) |

| Global | Packages | Uses | Top members |
| --- | --- | --- | --- |
| `process` | 12 | 858 | `env` 251, `cwd` 69, `stdout` 63, `platform` 60, `nextTick` 44, `exitCode` 35, `exit` 34 |
| `module` / `exports` / `require` | 9 / 5 / 8 | 1 188 | the CommonJS wrapper |
| `Buffer` | 7 | 150 | `from` 63, `byteLength` 20, `allocUnsafe` 15, `alloc` 14 |
| `setTimeout` / `clearTimeout` / `setImmediate` | 7 / 6 / 5 | 157 | — |
| `performance` | 5 | 52 | `now` 47 |

What `tsc` (TypeScript 6.0.3 `lib/_tsc.js`, 6.2 MB) needs:

- **fs, 15 functions, all `*Sync`, plus watchers:**
  - `writeSync` ×11, `realpathSync`, `openSync`, `closeSync`, `mkdirSync`, `writeFileSync`,
    `readFileSync`, `readdirSync`, `statSync`, `existsSync`, `utimesSync`, `unlinkSync`;
  - `watch`, `watchFile` and `unwatchFile`, used only by `--watch`.
- **Other modules:**
  - `path`: `join`, `dirname`, `resolve`.
  - `os`: `platform`, `EOL`.
  - `crypto.createHash`.
  - `perf_hooks.performance`.
  - `inspector.Session`, used only by `--generateCpuProfile`.
- **Globals:**
  - `process`: `env`, `stdout`, `platform`, `pid`, `execArgv`, `cwd`, `argv`, `exit`,
    `memoryUsage`, `nextTick`.
  - `Buffer.from`.
  - `setTimeout` and `clearTimeout`.
  - `__filename` and `__dirname`.
  - One computed `require(modulePath)`.

The minimum OS surface TypeScript itself declares is the `System` interface (`ts.sys`):

- `args`, `newLine`, `useCaseSensitiveFileNames`, `write`, `readFile`, `writeFile`;
- `fileExists`, `directoryExists`, `createDirectory`, `getDirectories`, `readDirectory`;
- `resolvePath`, `getCurrentDirectory`, `getExecutingFilePath`, `exit`.
- Watching, hashing, timers and `realpath` are optional members.
- (source: https://github.com/microsoft/TypeScript/blob/v6.0.3/src/compiler/sys.ts, tag v6.0.3)

*Synthesis:* a non-watch `tsc` run is fully synchronous. Its Node surface is about 30 functions,
and none of them needs an event loop.

## 2. Mode shape

- **Proposal:** `--node` (spelling open; `--platform=node` is the alternative) is orthogonal to
  `--mode`. *Synthesis.*
- **`js` mode + `--node`:** accepts CommonJS. `require` is legal. `module`, `exports`,
  `__filename` and `__dirname` are bound per module. The Node globals are declared.
- **`ts` mode + `--node`:** may `import … from 'node:fs'`. The wrappers are typed, so typed code
  stays unboxed. `require` stays a `ts`-mode error: no new escape hatch reaches `ts` mode.
- **Without `--node`:** nothing changes. `STA1110` stays "never". `process` keeps throwing
  `ReferenceError` (docs/SUBSET.md row "A reference to a name nothing declares").
- Why not a third mode: the mode is a *diagnostic policy* (plan §0.8). Node is a *platform*:
  module resolution plus globals plus a loop. They vary independently. A `ts`-mode program wants
  `node:fs` as much as a `js`-mode one does.
- What the gate learns: one more input to module resolution and to the ambient declarations.
  Below the gate, `node:*` modules are just more modules in the graph. Plan §0.8 is unaffected
  provided the loop is entered by `main`'s epilogue and not by a mode check.

## 3. CommonJS semantics

Source for the bullets in this section, unless marked otherwise:
https://github.com/nodejs/node/blob/v26.10.0/doc/api/modules.md (v26.10.0). The pinned oracle is
26.7.0. The CommonJS rules quoted here predate both.

- **Wrapper:** `(function (exports, require, module, __filename, __dirname) { … })`.
  `require()` returns `module.exports`, and reassigning `exports` rebinds only the local.
- **Static vs computed `require`:**
  - *Synthesis:* compile it like a bundler. Static `require('literal')` resolves at compile time
    into the module graph. Each CJS module becomes one function over a module record, and
    `require` becomes "run this record's body once, return `module.exports`".
  - `require.cache` is keyed by resolved filename. Deleting an entry forces a reload.
  - A computed `require(expr)` has no compile-time target. It compiles to a runtime lookup over
    the bundled records plus the built-ins, and throws Node's `MODULE_NOT_FOUND` otherwise.
  - In the corpus, the one computed site is tsc's plugin loader. "Plugin not found" at runtime is
    the honest answer there.
  - Prior art for "built-ins only, bundle the rest": Node SEA's injected script can `require` only
    built-in modules by default. Anything else needs bundling or `createRequire`. (source:
    https://nodejs.org/api/single-executable-applications.html, checked 2026-10-02)
- **Resolution:** follow modules.md's "All together" pseudocode. It covers core modules first;
  then `./`, `../` and `/`; then `#imports`; then package self-reference; then `node_modules`
  walking up the tree, with the `exports` field. Built-in names always win over a same-named
  file. Only `node:ffi`, `node:sea`, `node:sqlite`, `node:test` and `node:test/reporters` need
  the prefix.
- **Cycles:** CommonJS permits them. Per modules.md, a module in a `require` cycle "might not have
  finished executing when it is returned". Its partially filled `exports` object is what the
  other side sees.
  - `STA3001` (import cycle) is an ESM-graph rule (docs/DIAGNOSTICS.md).
  - *Synthesis:* a CJS cycle needs no static acyclicity. The module record starts as `{}` and
    fills as its body runs, which the dynamic representation already expresses.
  - Proposal: `STA3001` keeps applying to ESM `import` cycles, and CJS-to-CJS edges are exempt
    under `--node`.
- **ESM ↔ CJS interop (esm.md, v26.10.0):**
  - Importing CJS from ESM makes `module.exports` the default export. Named exports come from a
    static lexer the docs call "a convenience" (https://github.com/nodejs/node/blob/v26.10.0/doc/api/esm.md).
  - `require(esm)` is stable since v25.4.0, for graphs without top-level `await`.
    `module.createRequire(import.meta.url)` gives ESM a `require` (modules.md, v26.10.0).
  - *Synthesis:* because Stator resolves both kinds at compile time, interop is a lowering detail.
    The rule to copy is Node's for which names a CJS module exports to ESM. Use Node's documented
    behavior, checked against the oracle, not a guess.
- **`.js` disambiguation:**
  - The nearest `package.json` `"type"` decides.
  - With no `"type"`, Node parses as CJS first and falls back to ESM syntax detection
    (`MAYBE_DETECT_AND_LOAD`).
  - Stator must copy this exactly, because the same file means different things under each.

## 4. Backing: the `std` layer

### 4.1 What exists

- **`docs/STD.md`** freezes the decisions for `std`:
  - module path `std/*`;
  - sync first, Promise twins `not-yet` until T10.2;
  - errors thrown with a `code`;
  - POSIX only.
  Its header still reads "draft skeleton".
- **What has landed** (plan-notes 284): `std/env` and `std/path`, as fixtures over `declare`
  externs plus fixture C. There is no `packages/std`, no compiler-recognized `std/*` edge and no
  `jsrt_std_*` runtime file.
- **T10.1 steps 3–4** are open: `std/process` (`exit`/`pid`), sync `std/fs`, `std/time`.
- **No typed arrays:** no `Uint8Array`/`ArrayBuffer` anywhere in `packages/compiler/src`,
  `packages/runtime` or `plan.md` (grep, this tree).
  - `Buffer` is a `Uint8Array` subclass (https://github.com/nodejs/node/blob/v26.10.0/doc/api/buffer.md).
  - Any byte-level `std/fs` read, `TextEncoder`, a hash or a socket needs a byte container.
  - *Synthesis:* this is a prerequisite on its own, before the first non-string file API.
- **Single async machinery** (docs/SUBSET.md row for `async`/`await`; plan §11b "Do not invent a
  second event loop"):
  - Task 4.6's microtask queue is the only async machinery.
  - `main` drains it once after the module body, with no macrotask phase.
  - T10.2 plans an MPSC completion queue drained by main.

### 4.2 Proposed `std` modules

*Synthesis.* Each row is a typed `std/*` module. The C column names the backing. The last column
names the `node:*` wrappers that would sit on it.

| `std` module | Functions (v0 → later) | C backing | Serves |
| --- | --- | --- | --- |
| `std/env` ✅ fixture | `get`/`set`/`has`, `args`, `cwd` → `chdir`, `vars()` | `getenv`/`setenv`, `getcwd`/`chdir`, `environ` | `process.env`, `process.argv`, `process.cwd()` |
| `std/path` ✅ fixture | `join`/`dirname`/`basename`/`isAbsolute` → `resolve`, `relative`, `normalize`, `extname`, `parse`/`format` | pure TS (no syscalls) | `node:path` (`path.posix`; `win32` stays not-yet) |
| `std/process` (T10.1) | `exit`, `pid`, `abort` → `ppid`, `platform`, `arch`, `execPath`, `hrtimeNs`, `memoryUsage`, `kill`, signals | `exit`, `getpid`, `uname`, `getrusage`, `clock_gettime(CLOCK_MONOTONIC)`, `kill`; signals need the loop | `process.*` |
| `std/fs` (T10.1) | sync `open`/`read`/`write`/`close`, `readFile`/`writeFile` (string and bytes), `stat`/`lstat`, `readdir`, `mkdir`, `rm`/`unlink`, `rename`, `realpath`, `utimes`, `exists` → Promise twins, `watch` | POSIX fd calls. Promise twins on a thread pool. `watch` on inotify or kqueue/FSEvents | `node:fs`, `node:fs/promises` |
| `std/time` (T10.1) | `nowMs`, `sleepMs` → `monotonicNs` | `clock_gettime`, `nanosleep` | `performance.now()`, `Date` already exists |
| `std/bytes` (new) | the byte container (`Uint8Array`-compatible), UTF-8/latin1/base64/hex codecs | runtime heap object (Zig memory core, plan-notes 238) | `Buffer`, `TextEncoder`/`TextDecoder`, every byte API |
| `std/os` (new) | `platform`, `arch`, `release`, `hostname`, `homedir`, `tmpdir`, `cpuCount`, `totalMemory`, `eol` | `uname`, `sysconf`, `getpwuid_r`, `sysctl`/`/proc` | `node:os` |
| `std/io` (new) | `stdin`/`stdout`/`stderr` as fds, `write`/`read`, `isatty`, `terminalSize` | `write(2)`, `isatty`, `ioctl(TIOCGWINSZ)` | `process.stdout.write`, `node:tty` |
| `std/hash` (new) | `sha256`, `sha1`, `md5` over bytes or strings, `randomBytes` | vendored small hash C, `getentropy`/`arc4random_buf` | `crypto.createHash`, `crypto.randomUUID` |
| `std/loop` (new, N2) | timers (`after`, `every`, `cancel`, `ref`/`unref`), immediates, fd readiness, signal watchers, `run` | the loop of §4.3 | `setTimeout` & co, `timers/promises`, every async wrapper |
| `std/child` (new, N2) | `spawn(cmd, args, {env, cwd, stdio})` → pid + pipe fds, `wait`, `kill`, `spawnSync` | `posix_spawn` + `pipe`, or `uv_spawn` | `node:child_process` |
| `std/net` (new, N3) | TCP/Unix connect/listen/accept/read/write, `lookup` | sockets on the loop, `getaddrinfo` on the pool | `node:net`, then `http` |
| `std/thread`, `std/sync` (T10.2) | as planned | as planned | `worker_threads` only through a later mapping, and maybe never (§6) |

### 4.3 The event loop: one loop, owned by `std`

**Needed for N2 and later. N1 does not need it.**

What Node requires:

- **Phases** (https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick, checked
  2026-10-02):
  - the phases are timers → pending callbacks → idle/prepare → poll → check (`setImmediate`) →
    close callbacks;
  - the `nextTick` queue and then the microtask queue drain between callbacks;
  - `nextTick` is drained "after the current operation … and before the event loop is allowed to
    continue" (process.md, v26.10.0).
- **Liveness:** "the event loop will continue running as long as the timer is active", and
  `unref()` lets the process exit (timers.md, v26.10.0).
- **The thread pool** (default 4, `UV_THREADPOOL_SIZE`) backs:
  - all callback and Promise `fs` APIs except watchers;
  - `dns.lookup`;
  - async crypto and zlib.
  - (cli.md lines 4625–4646 and fs.md "Threadpool usage", v26.10.0)
- **`dns.lookup`** is `getaddrinfo(3)` on that pool (dns.md, v26.10.0).

Candidates:

| Option | Facts | Fit |
| --- | --- | --- |
| **libuv** | v1.53.0, 2026-09-24, MIT. Covers the loop (epoll/kqueue/IOCP/event ports), TCP/UDP, DNS, fs on a thread pool (default 4, max 1024), TTY, pipes, child processes, signals and threads. SemVer with a stable ABI within the major. Static CMake build. Tier 1: Linux, macOS 11+, Windows 10+. `uv_run(UV_RUN_NOWAIT)` and `uv_backend_fd`/`uv_backend_timeout` exist for embedding in a foreign loop. (sources: https://github.com/libuv/libuv/releases/tag/v1.53.0, https://github.com/libuv/libuv/blob/v1.x/README.md, https://github.com/libuv/libuv/blob/v1.x/SUPPORTED_PLATFORMS.md, https://docs.libuv.org/en/v1.x/threadpool.html, https://docs.libuv.org/en/v1.x/loop.html, checked 2026-10-02) | It is the loop Node runs on: "not possible to build Node.js without libuv" (process.md `features.uv`, v26.10.0). It covers `std/loop`, `std/child`, `std/net` and the fs/DNS pool in one maintained C library. |
| libxev | Zig, MIT. No tagged release (`build.zig.zon` 0.0.0). Last commit 2026-05-06. Linux io_uring/epoll, macOS kqueue, WASI. Windows "planned". Loop and thread pool only: no spawn, DNS, TTY or signals. (source: https://github.com/mitchellh/libxev, checked 2026-10-02) | Zig matches T9.1, but no release, no Windows, and half the surface is missing. |
| libevent | 2.1.13-stable, 2026-07-01, BSD-3. Loop plus buffered I/O, Windows via CMake. (source: https://github.com/libevent/libevent/releases, checked 2026-10-02) | No fs pool or spawn. Stator would rebuild those. |
| libev | 4.33, 2020-03-18. No release since. (source: http://dist.schmorp.de/libev/, checked 2026-10-02) | Unmaintained, so excluded by the dependency rule. |
| own POSIX loop | `poll`/`kqueue`/`epoll` + `posix_spawn` + own pool. Prior art: QuickJS-NG's `quickjs-libc.c` runs its own poll loop with `setTimeout`, `exec`, `waitpid` and `pipe`, all in one C file (https://github.com/quickjs-ng/quickjs/blob/master/quickjs-libc.c, checked 2026-10-02). | Smallest binary and no dependency. Stator then owns portability, the fs/DNS pool, signals and Windows. |

*Synthesis, recommendation:* libuv as the backing of `std/loop`, `std/child` and `std/net`.

- The plan's "do not invent a second event loop" is respected by making libuv's loop *the* loop.
  `main` runs the module body, then `uv_run`. Each libuv callback ends with
  `jsrt_run_microtasks()` and the `nextTick` queue in front of it, as Node does.
- Programs that never touch `std/loop` never link libuv, so N1 binaries stay libuv-free.
- **Open conflict to settle in `plan-notes.md` before code:** T10.2 plans its own worker threads
  and MPSC completion queue for `std/fs` Promise twins, and libuv brings its own pool. Two pools is
  the outcome to avoid. Options:
  - (a) T10.2's completion queue is a libuv `uv_async_t`, and the fs twins use `uv_fs_*`;
  - (b) the reverse: libuv is used only for readiness and spawn.
  - Either way, Boehm needs every pool thread that touches GC memory registered. This is
    inference: libuv's docs say nothing about GCs.

## 5. Oracle

- **Golden tests stay the primary oracle.** They compare byte-for-byte against the pinned Node
  26.7.0 (`.node-version`). Every `node:*` function lands with a golden, as every language
  construct does today (AGENTS.md "Testing rules").
- **Node's own suite** (https://github.com/nodejs/node/blob/main/test/README.md and
  doc/contributing/writing-tests.md, checked 2026-10-02):
  - `test/parallel` has 5 050 entries and `test/sequential` has 127 (git-trees API, `main`,
    2026-10-02).
  - A test passes by exiting 0.
  - Every test first does `require('../common')`, whose helpers (`mustCall`, `mustSucceed`)
    assert at exit.
  - Tests marked `// Flags: --expose-internals` reach `node:internal/*` and are not portable to
    another engine.
  - WPT is vendored under `test/fixtures/wpt`, with per-module status files
    (https://github.com/nodejs/node/blob/main/test/wpt/README.md).
- **Prior art for using it:**
  - Deno vendors the suite as a submodule under `tests/node_compat/`. A checked-in `config.jsonc`
    lists the tests expected to pass, with per-test `ignore`/`reason`/`flaky`/OS flags, and CI
    checks that list. Its docs claim "over 75%" of Node's suite passes as of Deno 2.8 (sources:
    https://github.com/denoland/deno/blob/main/tests/node_compat/README.md,
    https://docs.deno.com/runtime/fundamentals/node/, checked 2026-10-02).
  - Bun says it runs thousands of Node test-suite tests before each release and publishes
    per-module pass rates (https://bun.sh/docs/runtime/nodejs-compat, checked 2026-10-02).
  - LLRT does not run Node's suite. It uses its own unit and e2e tests plus WPT
    (https://github.com/awslabs/llrt, checked 2026-10-02).
- *Synthesis, proposal:* a `packages/tests/node-compat/` runner pinned to the `v26.7.0` tag,
  the oracle's own version, with these rules:
  - A Deno-style pass-list. "Pre-implementation" entries are reported, never hidden, which
    mirrors the subset runner's `@expected-fail` rule.
  - A Stator-side `test/common` shim.
  - `--expose-internals` tests are ignored with a reason.
  - Not part of `ci`, like `test262`.

## 6. Diagnostics

All proposals; codes are allocated only in `docs/DIAGNOSTICS.md`.

- **`STA1110`** (`require` is "never"): narrow its trigger to "without `--node`". With `--node`
  and `js` mode, `require` is legal. With `--node` and `ts` mode it stays `STA1110`; the message
  names `import`. It remains a never-class code, because its condition simply stops matching.
- **New not-yet family (`STA12xx`) for the platform:**
  - "`node:<module>` is not implemented yet (Phase 11, slice N<k>)".
  - "`<module>.<member>` is not implemented yet".
  - "computed `require` reached a module that is not in the bundle". This is a runtime throw with
    Node's `MODULE_NOT_FOUND` code, not a compile error, because Node also fails only at run time.
- **Never-class candidates:**
  - `node:vm`, `node:repl`, and `vm.runIn*`: these are `eval`, which is a permanent `never` in
    `ts` mode and the Phase 8 tier in `js` mode.
  - `node:inspector` and `node:v8` heap internals.
  - `process.dlopen` and `.node` addons: native addons have no meaning without V8's ABI.
  - Each of these needs the creator's ruling, since never-class is a design decision.
- **`worker_threads`:** every `Worker` gets a fresh isolate with message passing. T10.2 chose a
  shared heap and rejected isolates (plan §11b B). *Synthesis:* `node:worker_threads` cannot be a
  thin wrapper over `std/thread`. It stays not-yet until a card decides whether isolates come
  back, and that decision is the creator's.

## 7. Cost, by slice

*Synthesis.* The cost units follow the plan's complexity scale. "Exists" means landed in this tree.

| Slice | Delivers | Needs | Rough size |
| --- | --- | --- | --- |
| **P0 — prerequisites (not Node-specific)** | — | (a) `STA4072` recursion fix on large inputs (spawned separately). (b) js-mode coverage for tsc's 1 575 `STA1214` sites: method calls on inferred shapes 402, assignment to non-variables 518, unsupported globals 111, spreads ~190, Map/Set from iterables 71, `new` on non-class 50 (plan-notes 286). (c) Typed arrays, i.e. `std/bytes`. (d) A real `std/*` import edge per STD.md §6, then T10.1 steps 3–4. | The largest slice by far. (b) is a Phase 5-sized body of work. |
| **N1 — sync CLI (tsc without `--watch`)** | `--node` flag; CJS wrapper with static `require` and runtime-fallback computed `require`; globals `process` (argv/env/cwd/exit/exitCode/platform/pid/stdout.write/memoryUsage/nextTick), `Buffer.from`/`toString`, `__dirname`/`__filename`; `node:fs` sync subset (the 15 functions of §1); `node:path`, `node:os`, `node:perf_hooks`, `crypto.createHash` | `std/fs`, `std/process`, `std/os`, `std/io`, `std/hash`, `std/bytes`. No loop: `nextTick` and `setTimeout(0)` callbacks drain after `main`, like microtasks today. That is a documented approximation until N2, so a real delay must be not-yet. | Medium. Mostly wrappers plus a CJS lowering, once P0 lands. |
| **N2 — async CLI (execa, c8, yargs, dotenv class)** | `std/loop` (libuv), real timers and immediates, `fs.promises`, `fs.watch`, `node:events`, `node:child_process`, `node:stream` (Readable/Writable/Duplex/PassThrough), `node:util` (`format`/`inspect`/`promisify`), `node:url`, `node:tty`, `node:readline` | libuv, a decision on T10.2's pool, `std/child` | Large. `stream` and `util.inspect` are each big. The prior-art reading is that Deno vendors Node's own streams JS (`ext/node/update_node_stream.ts`, https://github.com/denoland/deno/tree/main/ext/node, checked 2026-10-02), so vendoring Node's MIT `lib/` JS for pure-JS modules is worth a separate decision. |
| **N3 — servers and bundlers (ws, vite, vitest class)** | `net`, `http`/`https`, `tls`, `dns`, `zlib`, `worker_threads`, `module` hooks, `vm` | a TLS library and a zlib (new dependencies), isolates or a no, `eval` | Very large. vite and vitest also lean on `vm`, `worker_threads` and `v8`, which §6 makes never or not-yet. |

## 8. Go / no-go

*Synthesis, recommendation for the creator's decision:*

- **Go: P0 and N1, in that order.**
  - N1 is small once P0 exists. It turns `tsc --version` and then `tsc -p` on a small project
    into a native binary: a real, measurable target with a byte-for-byte oracle (tsc's own
    output under Node 26.7.0).
  - P0 is worth doing for `js` mode regardless of `--node`.
- **Defer: N2.**
  - It needs the loop decision (§4.3), the T10.2 pool conflict settled, and a ruling on vendoring
    Node's `lib/` JS.
  - Revisit it once N1 is green.
- **No-go for now: N3.** It needs new heavy dependencies (TLS, zlib), isolates, and `eval`
  (`vm`). The two corpus members that need it, vite and vitest, are development tools, not the
  CLIs a native binary helps.
- **Shape decisions to record with the go:**
  - `--node` is a platform flag orthogonal to `--mode` (§2).
  - `std` first; `node:*` is TS over `std` with no C of its own (§0).
  - libuv backs `std/loop` (§4.3), or the own-loop alternative is chosen explicitly.
  - CJS cycles are exempt from `STA3001` under `--node` (§3).
  - `STA1110` is narrowed (§6).

## Sources not used as facts

These were read as leads only.

- Bun's implementation language and event-loop internals: the docs page states compatibility, not
  architecture. Statements from repository-language statistics are **unverified** and omitted.
- Static Hermes' typed-native pipeline: no primary doc could be fetched, so none of it is claimed.
  Hermes' Features doc says only that it has no runtime module loader, because bundlers supply
  one (https://github.com/facebook/hermes/blob/static_h/doc/Features.md, checked 2026-10-02).
- Porffor (https://porffor.dev, alpha-13 at https://github.com/CanadaHonk/porffor, checked
  2026-10-02) compiles JS AOT to C or Wasm. The builtins in `compiler/builtins` are ECMAScript
  only, with no `node:*` or `require`, and the site says "most existing JavaScript projects will
  not work out of the box yet".
- vercel/pkg is archived (2024-01-13) and recommends Node SEA (https://github.com/vercel/pkg).
  SEA and pkg both *bundle* Node rather than compile, so neither is a model for the backing.
