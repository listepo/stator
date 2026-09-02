# AGENTS.md — Stator

Instructions for AI agents (and humans) working in this repository. Read this file fully, then read `plan.md` — the roadmap and spec. When this file and `plan.md` disagree, `plan.md` wins; report the conflict in `plan-notes.md`.

`plan.md` holds only what is **still open**. Completed tasks live in `done.md`; read it when you need to know how something was built, not to decide what to build next.

## What this project is

**Stator** is an ahead-of-time compiler that turns TypeScript/JavaScript into native binaries, in two modes:

- **`ts` mode (default):** strict, statically compiled TypeScript. `.ts` files only. `any` is a compile error; dynamic escape hatches (`eval`, `new Function`, `Proxy`, prototype mutation, `var`, `arguments`) are compile errors — `eval` permanently, by design. Typed code compiles to unboxed machine values; that's where the speed comes from.
- **`js` mode:** JavaScript, or JS + TS mixed, in one module graph. Untyped code is never rejected — it compiles via a dynamic representation (NaN-boxed tagged values, shape tables, inline caches). `eval` is "not yet" until the Phase-8 interpreter tier.

One pipeline; mode is a policy layer (file acceptance + diagnostic table + typing of unresolved code). Nothing below the frontend gate knows the mode existed.

Pipeline: `typescript` API (parse + type-check, in-process) → mode gate → typed HIR → passes → C emitter → clang → link `libjsrt.a` (C11 runtime) → native binary. How that looks: D2 in `docs/architecture/` (gallery `docs/ARCHITECTURE.md`). `plan.md` §2 is the authority.

## Bootstrap awareness

If `src/` does not exist yet, the project is pre-Phase-1: the only files may be `plan.md`, `AGENTS.md`, and possibly `NICHE.md`/`plan-notes.md`. In that state your task is Phase 0 or Phase 1 of `plan.md`, and the Commands section below describes the *target* state, not the current one. Phase 0 requires an explicit human approval — never self-approve it.

## Golden rules

1. **Roadmap discipline.** Work `plan.md` top-down. A task is done only when its **Check** passes, and "done" is claimed only with the Check's command output cited. No Check, no done.
   **When a task's Check passes, move its record to `done.md` in the same change** — the evidence narrative goes there, and `plan.md` keeps the task's number and title as a struck-through one-line stub pointing at it. `plan.md` shrinks as work lands; that is the point. Three things never move: anything still **normative** (the locked `tsconfig.json`, a live Check), any part of a task that has **not** landed, and the task's **number and title**, because `plan.md §N Task X.Y` is referenced from code comments and `docs/` and must keep resolving. `done.md` is an archive, never an authority — if you find yourself citing it to justify a decision, the rule you want belongs in `plan.md` or `docs/`.
2. **The compiler is strict TypeScript.** No `any`, no non-null assertions, no `enum`/`namespace`/parameter properties (banned by `erasableSyntaxOnly`). Never weaken `tsconfig.json` or Biome rules to make code compile — fix the code.
3. **Compile a typed subset; never statically analyze untyped JS.** Untyped code goes to the dynamic representation or the Phase-8 tier. This rule killed every project that ignored it (see plan §0.1).
4. **Never trust a type annotation across a boundary.** `unknown`, unions, `JSON.parse`, FFI, and `.js`→`.ts` imports get runtime checks at the narrowing point. Inside checked code, trust types fully.
5. **Don't write a parser or type checker** — use the `typescript` package in-process. Don't write a regex engine — vendor QuickJS-NG's libregexp. Don't write a float printer — vendor Ryū.
6. **Plan changes by edit, not drift.** A contradiction between reality and `plan.md` goes to `plan-notes.md` with evidence, and the plan is edited in the same change. Settled decisions (plan §15.4) reopen only with new measured evidence.

## Repo map

```
plan.md            roadmap + spec (the authority) — OPEN work only
done.md            completion record for finished tasks (archive; not normative)
AGENTS.md          this file
plan-notes.md      evidence log for plan contradictions/decisions
NICHE.md           Phase-0 niche justification (human-gated)
docs/              ARCHITECTURE.md (D2 gallery) architecture/*.d2 MODES.md SUBSET.md DIAGNOSTICS.md VALUE.md NUMERIC.md HIR.md TOOLCHAIN.md
src/cli/           argument parsing, build/explain drivers
src/frontend/      ts.Program loading, mode policy gate, ts.Type → HType (only place ts.Type may appear)
src/hir/           typed HIR definitions, HType model, verifier
src/lower/         TS AST → HIR lowering
src/passes/        monomorphize, boundary-insert, const-fold, DCE, inline
src/codegen/       C emitter (#line source maps, JSRT_FRAME rooting discipline)
src/support/       diagnostics engine, shared utilities
runtime/           C11 runtime → runtime/build/libjsrt.a
runtime/include/jsrt_value.h   mirrors docs/VALUE.md — the codegen↔runtime contract
runtime/vendor/    Ryū, QuickJS-NG libregexp (+cutils/libunicode); patched only via plan-notes.md
tests/unit/        node:test unit tests (*.test.ts)
tests/subset/      decision tests (feature × mode matrix)
tests/golden/ts|js machine-checked vs Node, byte-for-byte
tests/differential/ fuzzer corpus    tests/bench/ baselines + results
tests/leak/        GC hygiene: a 10M-object loop whose RSS must plateau
```

## Architecture diagrams (for agents)

How the compiler works is drawn in **D2**, not Mermaid and not a new ASCII sketch.

| View | Source (edit this) | Render (GitHub) |
|---|---|---|
| Compile pipeline | `docs/architecture/pipeline.d2` | `docs/architecture/pipeline.svg` |
| `stator build` sequence | `docs/architecture/build.d2` | `docs/architecture/build.svg` |
| Package imports | `docs/architecture/packages.d2` | `docs/architecture/packages.svg` |
| Value boxing | `docs/architecture/values.d2` | `docs/architecture/values.svg` |

Gallery + captions: `docs/ARCHITECTURE.md`. Shared theme: `docs/architecture/theme.d2`.

- **Authority is `plan.md` §2.** If a diagram and §2 disagree, fix the diagram — or file `plan-notes.md` and edit §2 if the plan is wrong.
- Read `pipeline.d2` first when you need the pipeline. Do not invent a fifth view.
- When the pipeline changes (new pass, new package, `ts.Type` leaking, mode leaking below the gate), update the matching `.d2` in the same change and regenerate the SVG with the `d2` commands in `docs/ARCHITECTURE.md`.
- `d2` is a docs tool (`brew install d2`), not part of `pnpm run ci`.

## Commands

Dev runs TS directly on the pinned Node (≥24, see `.node-version`) — no build step needed.
`mise install` provides that Node, pnpm, just, and LLVM clang 21.1.8.

```
mise install                    # Node, pnpm, just, LLVM clang (Unix)
pnpm install --frozen-lockfile  # install (exact-pinned deps)
pnpm run typecheck              # tsc --noEmit (strict; must be clean)
pnpm run lint                   # biome check — lint + format (must be clean)
pnpm run format                 # biome check --write (applies safe fixes + formatting)
pnpm run dupes                  # cpd copy/paste detector (fails above 1% duplication)
pnpm run test                   # unit tests (node --test)
pnpm run test:coverage          # unit tests + src/ coverage table; writes coverage/lcov.info
pnpm run test:subset            # decision tests → verdict matrix
pnpm run test:golden            # compile + run vs Node, byte-for-byte
pnpm run test:runtime           # the runtime's own print corpus vs Node, byte-for-byte
pnpm run test:asan              # golden fixtures with runtime + generated C under ASan/UBSan
pnpm run test:leak              # 10M-object loop; RSS must plateau (skips without Boehm)
pnpm run bench:record           # refresh tests/bench/baseline.json (valid for this machine only)
just runtime                    # build libjsrt.a (clang, -Wall -Wextra -Werror)
just runtime-asan               # ASan/UBSan runtime build (golden tests must also pass on this)
just runtime-intl               # ICU feature build (off by default; needs pkg-config icu-uc icu-i18n)
pnpm run test:intl              # the intl_* golden fixtures against that build (not part of `ci`)
pnpm run ci                     # all of the above, in order — run before claiming any task done
node src/cli/main.ts build file.ts -o app [--mode=ts|js] [--emit=c] [--keep-c]
node src/cli/main.ts explain file.ts --json     # per-construct verdicts (decision tests use this)
```

## Implementation standards — TypeScript (`src/`)

- `tsconfig.json` is locked (full flag list in plan §4 Task 1.0): `strict` + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly`, NodeNext modules.
- Biome (`biome.json`) enforces: no `any`, no non-null assertions, exhaustive switches, type-only imports. Model discriminated unions and switch exhaustively — this is a compiler; unhandled cases are bugs.
- Runtime dependency budget: **`typescript` only**. New dependencies (even dev) need a `plan-notes.md` entry saying what a few lines couldn't do.
- User-facing failures are diagnostics (stable `STA` code + span + mode), never thrown stack traces. A thrown exception reaching the CLI is a compiler bug (`STA4xxx`).
- `ts.Type` never leaks past `src/frontend/` — everything downstream speaks HType.
- Comments state invariants the code can't (`// pops must mirror frame pushes, incl. landing pads`), not narration.

## Implementation standards — C runtime (`runtime/`)

- C11, `clang -Wall -Wextra -Werror`; ASan/UBSan job in CI is mandatory and blocking. The full flag set is the rule for code we WRITE (`runtime/src/`); `runtime/vendor/` compiles with `-Wall` alone, because upstream source is not ours to fix and a warning flag is not a correctness flag (plan-notes 101). ASan/UBSan cover both.
- All value access goes through `jsrt_value.h` accessors; no hand-rolled bit twiddling outside it.
- GC rooting discipline: every generated function opens `JSRT_FRAME(n)`; locals via `JSRT_LOCAL`; frames pop on **every** exit path including landing pads. The runtime may assume it; codegen must guarantee it.
- Generated C is never hand-edited — fix the emitter and re-emit.

## Testing rules

- **Decision tests** (`tests/subset/`): first-line directives `// @mode: ts|js`, `// @verdict: static|dynamic|error|not-yet`, `// @code: STAxxxx` (required for error/not-yet). Pre-implementation tests carry `// @expected-fail: true`; the runner reports (never hides) that count; removing the marker happens in the same commit that makes the test pass.
- **Golden tests** (`tests/golden/`): stdout must match the pinned Node **byte-for-byte** — including number formatting (Ryū shortest-round-trip). Never loosen a comparison to make a test pass; a mismatch is a semantics bug.
- Every new language construct lands with: decision test(s) for both modes + at least one golden test + HIR-verifier-clean build. Non-trivial runtime code lands with a unit test.
- Differential ground truth is the pinned Node LTS in `.node-version` — that Node, and only that Node.

## Diagnostics conventions

`STA0xxx` CLI/config/toolchain · `STA10xx`/`STA11xx` mode & subset violations (**never** class — by design, e.g. `STA1001` any-in-ts-mode, `STA1101` eval-in-ts-mode) · `STA12xx` **not-yet** class (message names the delivering phase) · `STA2xxx` lowering/boundary — mostly compile-time, but `STA2001` (boundary check failed) is the one diagnostic the *emitted program* raises at runtime · `STA3xxx` module graph (`STA3001` import cycle) · `STA4xxx` internal error (always a bug). Full table: `docs/DIAGNOSTICS.md`, which is the sole allocator — never allocate a code anywhere else, and never reuse, renumber, or revive a retired one. Tests reference codes, not message text.

## Workflow

1. Find the first unmet Check in `plan.md` (phases in order, tasks in order). That's the current task, unless the human directs otherwise. A struck-through stub is done — its evidence is in `done.md`; don't redo it.
2. Before coding, read the docs the task references (`docs/VALUE.md`, `docs/NUMERIC.md`, …). If the task leaves you guessing, that's a plan bug — fix `plan.md` via `plan-notes.md`, don't invent conventions in code.
3. Implement with tests (see Testing rules). Run `pnpm run ci` locally.
4. Move the finished task's record from `plan.md` to `done.md` (golden rule 1), leaving the stub behind.
5. Report: what changed, the Check command + its output, any `plan-notes.md` entries added.
6. Commit style: short imperative subject naming the task (`phase2: emit JSRT_FRAME prologue (task 2.4)`); one task per commit where practical.

## Don'ts

- Don't self-approve the Phase-0 gate; don't skip a phase's entry Check.
- Don't add dependencies, weaken compiler options, or disable lint rules to get unstuck.
- Don't hand-edit generated C or `runtime/vendor/` (vendored patches only via `plan-notes.md`).
- Don't quote competitor benchmark numbers as measurements — measure locally, record version/flags/hardware.
- Don't "fix" a golden-test mismatch by changing the expected output without proving Node produces it.
- Don't let mode logic leak below the frontend gate — if a pass or the emitter needs to know the mode, the design is wrong (plan §0.8).
- Don't draw the compiler pipeline in Mermaid or a new ASCII sketch — D2 in `docs/architecture/` is the diagram language.
