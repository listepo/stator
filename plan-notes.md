# plan-notes.md

Evidence log for contradictions between `plan.md` and reality, and for decisions the plan told
us to record. Newest first. Every entry names the plan section it touches and says whether
`plan.md` was edited in the same change (AGENTS.md golden rule 6).

---

## 2026-08-29 — Phase 1 Task 1.0 bootstrap

### 1. npm package name `stator` is taken → package `statorc`, binary stays `stator`
**Plan:** §4 Task 1.0 step 3 anticipated exactly this. **Evidence:** `npm view stator` returns
`name = 'stator'`, `version = '0.1.0'` (an unrelated package). `npm view statorc` → 404.
**Decision:** `package.json` `"name": "statorc"`, `"bin": {"stator": "dist/cli/main.js"}`.
The user-facing binary is unaffected. A unit test (`tests/unit/cli.test.ts`) pins both, so the
binary name cannot drift silently. **plan.md edited:** no — the plan already prescribed this.

### 2. TypeScript `latest` is now 7.0.2 (tsgo) — pinned 6.0.3 instead
**Plan:** §0.3 and §4 Task 1.0 step 4 ban TypeScript 7 / tsgo (its public compiler API is
incomplete). **Evidence:** `npm view typescript dist-tags` → `latest: 7.0.2`, `rc: 7.0.1-rc`,
`beta: 6.0.0-beta`. Newest stable 6.x is `6.0.3`. **Decision:** pin `typescript@6.0.3` exactly.
**Re-evaluate quarterly** (next: 2026-11-29) — the question is not whether 7.x is *stable* but
whether its public compiler API (`createProgram`, `getTypeChecker`, and the AST surface we
lower from) is complete and documented. **plan.md edited:** no — pin is inside the plan's rule.

### 3. The locked `tsconfig.json` needed two more flags to work at all
**Plan:** §4 Task 1.0 step 5 declares the `compilerOptions` block "load-bearing and locked".
**Problem:** as written it cannot both (a) run under Node's native type stripping in dev and
(b) emit runnable JS via `npm run build`. Node resolves relative imports literally, so source
must write `import { x } from './build.ts'` — which plain `nodenext` rejects.
**Fix:** added `"allowImportingTsExtensions": true` (lets source use real `.ts` specifiers) and
`"rewriteRelativeImportExtensions": true` (rewrites them to `.js` on emit, so `dist/` runs).
Both are additive; nothing was weakened — every strictness flag in the locked block is intact.
**plan.md edited:** yes — §4 Task 1.0 step 5's block now contains the two flags.

### 4. A second tsconfig for `tests/`
**Plan:** the locked `tsconfig.json` sets `rootDir: "src"`, `include: ["src"]` — so nothing
under `tests/` is type-checked, and ESLint's `projectService` reports
"was not found by the project service" for every test file.
**Fix:** added `tests/tsconfig.json` extending the locked one (`noEmit`, `rootDir: "."`,
`include: ["**/*.ts"]`, excluding the deliberately-invalid fixture directories
`subset/subset_*`, `golden/ts`, `golden/js`, `differential`). `npm run typecheck` runs both
projects. The locked config is untouched and still governs `src/`.
**plan.md edited:** yes — §4 Task 1.0 step 5 now mentions the tests project.

### 5. `node --test tests/unit/` does not work on Node 26
**Plan:** §4 Task 1.0 step 9 specifies that exact script. **Evidence:** Node 26.7.0 treats the
directory argument as a module to load: `Error: Cannot find module '.../tests/unit'`.
**Fix:** `node --test "tests/unit/*.test.ts"` (glob form). Verified: 6 tests pass.
**plan.md edited:** yes — §4 Task 1.0 step 9.

### 6. `CC ?= clang` in the runtime Makefile silently used `cc`
**Evidence:** first `make -C runtime` compiled with `cc`, not `clang` — make's *built-in*
default for `CC` is already defined, so `?=` never fires. **Fix:** override only the built-in
default, so an explicitly-set `CC` from the environment still wins:
`ifeq ($(origin CC),default)` / `CC := clang` / `endif`. **plan.md edited:** no — an
implementation detail below the plan's granularity.

### 7. Sanitized runtime builds to `build-asan/`, not `build/`
**Plan:** §4 Task 1.0 step 8 says `make -C runtime asan` "adds" sanitizer flags but does not
say where the archive lands. **Decision:** separate output directories (`build/libjsrt.a`,
`build-asan/libjsrt.a`) so a sanitized archive can never be linked into a release binary
because of a stale object file. **plan.md edited:** no — additive detail, recorded here.

### 8. `void test(...)` in unit tests
`node:test`'s `test()` returns a promise the runner owns; `typescript-eslint`'s
`no-floating-promises` flags every call. Marked with the `void` operator — the escape the rule
itself sanctions — with a comment saying why. No lint rule was disabled (AGENTS.md forbids it).

### 9. Node pin is 26.7.0 — OPEN QUESTION for the owner
`.node-version` is pinned to the host's `26.7.0`, satisfying the plan's `>= 24`. But plan §4
Task 1.0 step 2 says "current Node **LTS**", and 26.x may still be Current rather than LTS.
Since this pin is the differential-testing ground truth for the life of the project, the owner
should confirm: stay on 26.7.0, or drop to the active 24.x LTS line. **Unresolved.**

---

## 2026-08-29 — Phase 1 Tasks 1.1–1.3 (the three spec documents)

### 10. Diagnostic-code collisions between `docs/SUBSET.md` and `docs/DIAGNOSTICS.md`
**Plan:** §4 Task 1.3 names `docs/DIAGNOSTICS.md` as the full code table, so it is the
authoritative allocator. **Problem:** the matrix (Task 1.1) and the code table (Task 1.3) were
written concurrently and each allocated from the same ranges, so six codes ended up with two
different meanings, and three more were duplicates of codes the table had already assigned.
**Decision:** `DIAGNOSTICS.md` wins every collision; `SUBSET.md` was remapped:

| Was (SUBSET) | Now | Because `DIAGNOSTICS.md` already used the old number for |
|---|---|---|
| STA1110 Proxy (ts) | STA1106 | CommonJS `require()` |
| STA1111 prototype mutation (ts) | STA1107 | `.tsx`/`.jsx` |
| STA1112 `delete` class field (ts) | STA1108 | — (moved to keep the ts trio contiguous) |
| STA1203 `new Function` (js) | STA1206 | Proxy (js), Phase 8 |
| STA1204 dynamic `import()` | STA1207 | prototype mutation (js), Phase 8 |
| STA1205 top-level `await` | STA1208 | `delete` class field (js), Phase 8 |
| STA1214/1215/1216 Proxy / proto / delete (js) | STA1203/1204/1205 | duplicates of existing rows |

`SUBSET.md`-only features that had no row in the table got one: `STA1207`, `STA1208`,
`STA1210`–`STA1213`, plus `STA2001` (the boundary check, which both `MODES.md` and `SUBSET.md`
referenced but nothing had allocated). `STA1209` is deliberately left unallocated.
**plan.md edited:** no — the plan delegates the full table to `DIAGNOSTICS.md`; only the
`STA1102` change below touched it.

### 11. `STA1102` retired — a "not yet" code inside the "never" range
**Plan:** §1.3 requires that "never" codes and "not yet" codes occupy **disjoint ranges so tests
can tell intent from schedule**. `STA1102` was allocated for eval/`new Function` in `js` mode —
a *deferral* (Phase 8) — but sits in `STA11xx`, the permanent-rejection range. A test asserting
"this is rejected by design" could not be distinguished from one asserting "this ships later".
**Fix:** renumbered globally to `STA1206` across `plan.md`, `docs/MODES.md`,
`docs/SUBSET.md`, `docs/DIAGNOSTICS.md`. `STA1102` is listed in a new "Retired codes" table in
`DIAGNOSTICS.md` and must never be reused. This is only possible because nothing has shipped;
after v1, the fix for a misfiled code is to add a correct one, never to move it.
**plan.md edited:** yes — §1.2's `eval`/`new Function` reference now reads `STA1206`.

### 12. `stator explain --json` emits both a per-construct array and a file-level rollup
**Plan:** §1.3 and `AGENTS.md` promise *per-construct* verdicts; `tests/subset/run.ts` (§4 Task
1.4) reads a *single* top-level verdict. Item 3 of the "Open items" list flagged these as
contradictory. **Decision:** they are not exclusive — emit both. `constructs` is the primary
artifact (dropping it would remove the only thing `explain` exists for: locating *which*
construct went dynamic). The top-level `verdict`/`code` is derived from it by severity
`error > not-yet > dynamic > static`, with `code` taken from the first construct in source order
carrying the winning verdict, and **omitted, never `null`**, when the rollup is `static` or
`dynamic`. Because each decision-test fixture isolates one construct, the rollup is exactly that
construct's verdict — so `tests/subset/run.ts` needed **no change**. Schema and two worked
examples are in `docs/MODES.md` §6. **plan.md edited:** no — the resolution satisfies both
§1.3 and the Task 1.4 runner as written.

### 13. Four contradictions found in `docs/MODES.md` while reconciling
Each was fixed in favor of the authoritative document, not the more recent one.
1. **Column indexing.** `MODES.md` claimed "0-indexed columns; matches editors and `grep -n`";
   `DIAGNOSTICS.md` specifies 1-indexed. `DIAGNOSTICS.md` is right on both counts (`tsc` and
   `clang` are 1-indexed; `grep -n` reports no column at all). All `MODES.md` examples shifted.
2. **Six constructs sharing `STA1101`.** `MODES.md` §2 gave `Proxy`, prototype mutation, `var`,
   `arguments`, and `new Function` the same code as `eval`, which would make a test unable to
   assert *why* a file was rejected. Split to the codes the table already allocated.
3. **`Symbol` listed as permanently rejected.** It is `STA1212`, Phase 5 — a deferral. Nothing
   outside plan §1.1's closed list may be called permanent, and `Symbol.iterator` especially
   cannot be, since `for`…`of` over a typed iterable is a supported static construct.
4. **`STA2001` described as a compile-time error.** A boundary check fails at *runtime* by
   definition — the boundary exists because the type is unknowable statically (plan §0.2). The
   static guarantee is that the check is emitted, not that it passes. `DIAGNOSTICS.md` now
   carries a `runtime` diagnostic class for exactly this one code.

Also corrected in passing: `MODES.md` used `process` as an example function name in a document
that elsewhere states there is no `process` global, and the example then read `process.env` —
which in real JS resolves to the local function, not Node's global. Renamed.

### 14. The subset runner now validates `@code` against `docs/DIAGNOSTICS.md`
**Plan:** §4 Task 1.4 step 2 says expected-fail fixtures are counted, not executed. **Gap that
creates:** an expected-fail fixture is the *only* kind nothing looks at, so a `// @code:` naming
a code that was never allocated — or one that was retired, like `STA1102` — would sit unnoticed
until the phase that implements the feature, which is years away for the Phase-8 rows. Since
the whole corpus lands expected-fail, that is the entire corpus.
**Fix:** `tests/subset/run.ts` parses the allocated codes out of `docs/DIAGNOSTICS.md` (stopping
at the "Retired codes" heading, so retired codes correctly fail) and checks every fixture's
`@code`, expected-fail included. Directive parsing already ran on every fixture; this rides
along with it. **plan.md edited:** no — Task 1.4 step 1 already charges the runner with parsing
directives and asserting codes; this closes the case the step did not anticipate.

### 15. `STA1112` allocated for decorators
`docs/SUBSET.md`'s "Out of scope for v1" section listed decorators as `error` with **no code**,
which Task 1.4 cannot express — the runner requires `@code` for an `error` verdict. Allocated
`STA1112` in the `never` range, not `not-yet`: decorators are a plan §0 non-goal and no phase
promises them, so there is no phase name for a not-yet message to carry.

---

## 2026-08-29 — Phase 1 Task 1.4 (decision-test corpus)

### 16. Corpus written: 152 fixtures, 76 matrix rows × 2 modes
**Check met:** `docs/SUBSET.md` has 76 feature rows; `tests/subset/` holds 76 `_ts` and 76 `_js`
fixtures with identical slug sets, so every row has exactly one decision test per mode.
`npm run test:subset` reports `152 fixtures — 0 passed, 152 expected-fail, 0 failed`. Every one
carries `// @expected-fail: true`, which is correct and not a shortcut: `explain` does not exist
until Phase 2, so nothing here *can* pass yet. That count is the number to watch fall.

**Convention adopted for conditional verdicts.** Many rows read "static if typed, else dynamic".
A fixture must pin exactly one verdict, so: the `ts` fixture takes the *typed* branch (`static`)
— ts mode rejects untyped code, so the typed case is the only reachable one there — and the `js`
fixture takes the *untyped* branch (`dynamic`) with a deliberately untyped body. The two fixtures
together cover both branches of the row, and neither is ambiguous on its own. Rows whose feature
is TypeScript-only syntax (type annotations, interfaces, unions, `unknown`, generics) have a
`js`-mode fixture with a `.ts` extension, since `js` mode accepts `.ts` files and gives them the
full static treatment — which is exactly what those rows assert.

### 17. `docs/SUBSET.md` "Static methods and static class members" was under-specified
The `js` cell read "static (where typed)", which has a condition but no else-branch, so the
generated fixture claimed `static` for an untyped `.js` body — a verdict the row does not
actually support. **Fix:** the cell now reads "static if typed, else dynamic" like its siblings,
with a note distinguishing the two halves: a static *method* is always static (its identity is
fixed at compile time), while a static *field* follows its value, so an untyped one holds
`Unknown` and reads route through the dynamic path. Fixture corrected to `dynamic`.

### 18. `exclude` does not stop a file entering the program by import
**Symptom:** `npm run typecheck` failed on `tests/subset/subset_cyclic_imports_ts.ts`, a fixture
`tests/tsconfig.json` explicitly excludes. **Cause:** `exclude` only removes files from the
*root* set. The cyclic-import row needs a partner module to form a real cycle; that partner
(`cycle_partner_ts.ts`) was not excluded, so it was a root, and its `import` pulled the excluded
fixture back into the program — where `noUnusedLocals` promptly flagged it.
**Fix:** exclude the fixture support files by name (`subset/helper_*`, `subset/cycle_partner_*`)
in both `tests/tsconfig.json` and `eslint.config.js`. With no root reaching them, the fixtures
stay outside the program. `tests/subset/run.ts` is still checked, which is the point of having
the tests project at all. Worth remembering: for deliberately-invalid fixtures, *every* file that
imports them must be excluded too, not just the fixtures themselves.

### 19. ESLint + typescript-eslint replaced by Biome
**Touches:** plan §4 Task 1.0 steps 4/6/9, §15.4 rule 7, `docs/TOOLCHAIN.md`.
**Change:** two dev deps (`eslint` 10.9.1, `typescript-eslint` 8.68.0, ~130 transitive packages)
replaced by one (`@biomejs/biome` 2.5.11, a single Rust binary) that does lint *and* format.
`eslint.config.js` deleted, `biome.json` added. Net dev-dependency count goes down, so the
budget rule (AGENTS.md) is satisfied by subtraction, not exception. §15.4's "no Rust anywhere"
is a decision about what the *compiler* is written in; it does not bind dev tooling.
**Rule parity:** the four load-bearing rules all exist in Biome and are set to `error` —
`noExplicitAny`, `noNonNullAssertion`, `useExhaustiveSwitchCases` (nursery), `useImportType`.
The `types` domain gives Biome's own type inference, which is what `useExhaustiveSwitchCases`
and `noFloatingPromises` need; there is no `tsconfig` project service and no tsc invocation.
**Known gap:** `strictTypeChecked`'s full type-aware set has no Biome equivalent. In particular
`noUnnecessaryConditions` (Biome's `no-unnecessary-condition`) is **off**: Biome's inference does
not model `noUncheckedIndexedAccess`, so it flagged the required `?.` in
`tests/subset/run.ts:45` (`match?.[1]?.trim()`) as unnecessary. Re-enable only if that changes.
`tsc --noEmit` under the locked strict config still carries most of that weight.
**Also:** `biome check` is format-checking too, so `npm run lint` now fails on unformatted
source; `npm run format` writes fixes. Warnings are escalated with `--error-on-warnings` because
Biome exits 0 on warning-level diagnostics by default. Entry 18's `eslint.config.js` fixture
excludes now live in `biome.json` under `files.includes` as `!`-prefixed patterns.
**Check:** `npm run lint` → `Checked 15 files in 137ms. No fixes applied.`, exit 0.

### 20. npm → pnpm, and `cpd` added as a duplication gate
**Touches:** plan §4 Task 1.0 steps 4/9/10, `docs/TOOLCHAIN.md`, `ci.sh`, `.github/workflows/ci.yml`.
**Package manager:** pnpm 11.20.0, pinned by `packageManager` in `package.json` so Corepack and CI
agree without a second pin. `package-lock.json` deleted, `pnpm-lock.yaml` committed.
`npm ci` → `pnpm install --frozen-lockfile` everywhere (`ci.sh`, the workflow, AGENTS.md, docs).
The workflow gains `pnpm/action-setup@v4` before `setup-node` and `cache: pnpm`.
Exact pinning is unchanged: pnpm was given `-E`, so every dep is still a bare version, not a range.
**Duplication:** `cpd` 5.0.16 (the Rust rewrite of jscpd; same repo, new package name) as a dev dep,
configured by `.jscpd.json` — `minTokens: 50`, `mode: strict`, `crossFormats: js-ts`, `threshold: 1`,
`reporters: ["ai"]`. The AI reporter is the compact `path start-end ~ start-end` form, chosen because
the console/HTML reporters print full clone bodies that no agent or reviewer needs.
`crossFormats: js-ts` matters here specifically: `tests/` holds a `.ts` and a `.js` spelling of the
same program for most rows, and cross-format detection strips type annotations before comparing.
**Ignores mirror `biome.json`:** the 152 `subset_*` fixtures and the golden/differential trees are
deliberate near-duplicates (each row exists twice, once per mode) — scanning them reports ~100%
duplication and hides everything real. `runtime/vendor/` is excluded for the same reason it is
never hand-edited.
**Gate:** `dupes` runs inside `pnpm run ci`, between `lint` and `test`, and fails above 1%
duplication. Current state is **3 clones, 0.4%** — all three are benign and left alone
(the two ci.yml job bodies, a repeated JSON block in `docs/MODES.md`, and the shared
spawn/report preamble of `tests/golden/run.ts` and `tests/subset/run.ts`). The threshold is a
ratchet against new duplication, not a demand to refactor these.
**Check:** `pnpm run ci` green end to end; `pnpm run dupes` → `3 clones · 0.4% duplication`, exit 0.

---

## 2026-08-29 — Phase 2 Task 2.1 (`docs/VALUE.md`, the value contract)

### 22. Phase 2 started with the Phase 0 gate still open — owner instruction, second time
**Plan:** §3 says the gate needs a human decision, and the §3 status block added at Phase 1 close
says explicitly that the gate and the initial commit must both land "before Phase 2 work starts".
**What happened:** the owner instructed "go next" with Phase 0 still open, which is the same
explicit-instruction exception Phase 1 already ran under. **What was NOT done:** no `NICHE.md`
was written and no `phase-0-approved` tag was created. An agent writing the niche justification
and then approving it is the exact failure the gate exists to prevent (plan §3 Task 0.1 step 4),
and "the owner said go" does not convert an agent-authored file into a human decision. The gate
stays open and stays the owner's. **plan.md edited:** no — the §3 status block is still accurate.

### 23. NaN canonicalization is mandatory, because the default NaN collides with `undefined`
**Decision recorded because it constrains every future emitter change.** The tag space is
*negative* quiet NaNs (mask `0xFFF8000000000000`). On x86-64, the SSE default NaN from `0.0/0.0`
is `0xFFF8000000000000` — bit-identical to `JSRT_UNDEFINED`. An arithmetic NaN reaching a value
slot unfiltered would therefore silently *become* `undefined`.
**Rule:** every double entering a `jsrt_value` goes through `jsrt_number()`, which replaces any
NaN with the canonical positive quiet NaN. Generated C never bit-casts a double into a value,
with no exception for literals the emitter believes cannot be NaN — the cost is one predictable
branch and the failure mode is silent corruption. Legal because ECMAScript exposes exactly one
NaN, so the substitution is unobservable.

### 24. `-0.0` drove the `Int32` demotion rule, which Phase 2 does not even use
`(double)(int32_t)(-0.0) == -0.0` is **true**, so the obvious "is it integral and in range" test
admits `-0.0` and would quietly demote it to `+0` — breaking `Object.is(-0, 0) === false` and
`1/-0 === -Infinity`, both of which plan §2 names as decision tests. `jsrt_fits_int32()` carries
an explicit `signbit` clause for this and exists as a named helper precisely so the check cannot
be re-derived incorrectly at a call site. Phase 2 emits no `Int32` at all (all numbers are f64
per plan §5); the tag and the rule are specified now so Phase 3 turning it on is a codegen change
with no layout change.

### 25. `console.log(-0)` prints `-0`, but `String(-0)` is `"0"` — two functions, not one
`Number::toString(-0)` is specified to return `"0"`. Node's `console.log` runs values through
`util.inspect`, which prints `-0` to keep the distinction visible. Golden tests compare
`console.log` output byte-for-byte, so `jsrt_print` implements the **inspect** rule and
`jsrt_to_string` implements the **spec** rule; both are declared in `jsrt_value.h`.
Recorded because the alternative is discovering it as a one-character golden diff and
misdiagnosing it as a Ryū bug.

Two adjacent number-formatting traps are documented in `docs/VALUE.md` §3.2 for the same reason:
the decimal/exponential threshold is **1e21**, far above what a C library's `%g` uses, and
negative exponents are written `1e-7` with **no zero padding**. `%g` gets both wrong.

### 26. `jsrt_strict_equals` is a function from day 1, though Phase 2's subset barely needs it
`===` is not `a == b` on the raw 64-bit value: `NaN !== NaN` despite the canonical NaNs being
bit-equal, and `+0 === -0` despite those being bit-unequal. Once Phase 3 emits `Int32`, a number
also has two representations. Writing the cheap version now and fixing it later would mean every
emitted comparison is wrong in two edge cases that golden tests would catch only by luck.

### 27. `HType` ships with six kinds, not the full model from plan §2
`src/hir/types.ts` implements the primitives plus first-class `Unknown`. The compound kinds
(`fn`, `array`, object-shape, map/set, union, generic-instance) and the `i32` refinement are
absent rather than stubbed: an unconstructed variant is a switch case every pass must carry and
no test can reach. They land with the Phase 3 ladder and `NUMERIC.md`.
`Unknown` carries a `fromImplicitAny` flag because the gate — and only the gate — needs to tell
"the user wrote nothing" from "the checker genuinely could not resolve this"; in `ts` mode the
first is an error and in `js` mode both are the dynamic path.

### 28. Ryū is not vendored; the shortest-round-trip search stands in for it
Task 2.5 says "vendored Ryū (`runtime/vendor/ryu/`) wired into number printing". Ryū was not
vendored: this environment has no network access to fetch it, and hand-transcribing a float
printer is exactly the mistake AGENTS.md rule 5 exists to prevent.

`shortest_digits()` in `runtime/src/jsrt_print.c` produces the same answer by a different route:
for p = 0..17 it formats with `%.{p}e` and keeps the first p whose `strtod` round-trips. Searching
over *significant* digits means the first success is the minimal digit count, which is precisely
what ECMA-262 `Number::toString` step 5 asks for. It is correct and slow — up to 18
snprintf+strtod pairs per number printed.

Evidence that it is correct: `make -C runtime test` diffs a 45-line corpus of hostile doubles
(1e20, 1e21, 0.1+0.2, 5e-324, ±0, the int32 boundaries) against `console.log` on the pinned Node
and passes byte-for-byte, clean and under ASan/UBSan.

The swap is contained on purpose. Ryū replaces the body of `shortest_digits()` alone — its
`(digits, k, n)` contract and every caller stay as they are — so vendoring later is a
one-function change, not a rewrite. Plan text updated to say so.

### 29. Boehm GC is not installed here, so the runtime is the documented malloc fallback
`pkg-config --cflags bdw-gc` finds nothing on this machine. `runtime/Makefile` already had the
fallback branch; both `make -C runtime` and `make -C runtime asan` build and report which one
they took. Nothing in Phase 2 frees memory, so no collection is not yet observable.

Found while checking it: the `CFLAGS_COMMON += -DJSRT_HAVE_BOEHM` line sat *below* the
`CFLAGS_REL := $(CFLAGS_COMMON) -O2` assignment. `:=` expands immediately, so on a machine that
*does* have bdw-gc the define would have been dropped and the build would have used plain malloc
while printing "Runtime built with: Boehm GC". Fixed by moving detection above the assignments.
The bug was invisible here precisely because the fallback is the branch we take.

### 30. The gate accepted eight constructs the HIR cannot represent
The first version of `gateConstruct` accepted `&&`/`||`, `+=`/`-=`, `==`/`!=`, unary `+ - !`, any
call expression, and any property access. `src/hir/nodes.ts` has no node for any of them, so each
would have passed the gate and then hit an `STA4xxx` internal error in the lowering — the compiler
reporting its own bug for source it had just chosen to accept. Two more were worse: every node
kind not on the accept list fell through to a catch-all, which meant the `NumberKeyword` inside
`let x: number = 1` was rejected as an unsupported construct, and `.d.ts` files were walked as if
they were programs.

`gateConstruct` was rewritten so its accept set equals the HIR's vocabulary exactly, with that
invariant stated at the top of the function. Type nodes and declaration files are now skipped
before gating rather than gated and rejected.

The general rule this produced: **widening the HIR and widening the gate are the same change.**
A construct the gate accepts that the lowering cannot lower is not a missing feature, it is a
disagreement about the subset, and it always surfaces as an internal error.

### 31. Four separate STA collisions, from four modules allocating their own codes
The lowering allocated `STA4000`–`STA4007`, the verifier `STA4001`–`STA4019`, the CLI already had
`STA4001`, and the gate invented `STA1214`–`STA1218` and `STA1299` as placeholders. So `STA4001`
had three meanings and `STA4002`–`STA4007` two each.

Resolved by allocating properly in `docs/DIAGNOSTICS.md` (the sole allocator): verifier
`STA4002`–`STA4020`, lowering `STA4030`–`STA4037`, `STA4021` for explain, with a deliberate gap
between the blocks so either can grow without renumbering. The verifier and lowering also had the
code duplicated *inside* the message text, which rendered as `STA4031 [ts] STA4031: ...`; the code
is a field, and messages no longer repeat it.

The gate's six placeholder codes became one, `STA1214`. They were not six different facts: every
one of them means "the subset has not reached this yet", they all resolve the same way, and they
all disappear as the lowering ladder climbs. The construct is named in the message; the code names
the boundary. This is the opposite call from the one in entry 15 — there, six constructs shared
`STA1101` while being rejected for six *different permanent* reasons, and splitting them let a
test assert which. Different codes are worth it when they mean different things.

### 32. `tsTypeToHType` typed every literal in every program as `Unknown`
It tested `TypeFlags.Number` but not `NumberLiteral`. The type of `1` is `1`, not `number`, so
`console.log(1 + 2 * 3)` lowered to a tree of `Unknown` and the verifier rejected the compiler's
own output. Same for strings and booleans. `void` also fell through to `Unknown`, so every
`console.log` call did too.

Fixed by matching each primitive's literal flag as well, and mapping `void` to `undefined` — the
HIR models values, and a function that returns nothing evaluates to `undefined` at runtime.
`TypeFlags.NumberLike` was deliberately *not* used: it also covers `Enum`, and `erasableSyntaxOnly`
bans enums, so accepting one as a number would hide a rejection that should happen.

Also fixed alongside: `isImplicitAny` called `getTypeAtLocation` on every node it was given,
including the `SourceFile`, which has no `parent` — TypeScript threw a `TypeError` out of the
compiler. It now asks only about nodes that could have carried an annotation.

### 33. Number literals must be emitted as C *double* literals, not as `String(n)`
`console.log(1e20)` emitted `jsrt_number(100000000000000000000)`, which clang rejects outright:
"integer literal is too large to be represented in any integer type". Two quieter variants of the
same bug: `7` emitted an `int` literal, and `-0` emitted `0`, silently discarding the sign that
`docs/VALUE.md` §1.3 spends a paragraph on.

`cDoubleLiteral()` in `src/codegen/index.ts` now handles the non-finites, preserves `-0.0`, and
appends `.0` to anything `String(n)` renders without a `.` or an exponent. `String(n)` is already
the shortest decimal that round-trips, so the result is both exact and legal C.

Caught by `tests/golden/ts/numbers.ts` on its first run — which is the argument for having built
the golden harness against Node rather than against expectations written next to the code.

### 34. The Stator global environment is a `.d.ts` Stator owns, not Node's or the DOM's
`console` was undefined: compiled programs get neither `@types/node` nor `lib.dom`, and they
should not — a program that type-checked against a global the runtime does not provide would fail
at link time instead of as a diagnostic. `src/frontend/lib/stator.globals.d.ts` now declares
exactly what `libjsrt.a` implements, which today is `console.log`, and it is passed to
`ts.createProgram` as a root file. A declaration there is a promise the runtime has the symbol.

Found at the same time: `lib: ['es2023']` resolved to nothing, leaving the program with no
`Array`, `Object`, or `Number`. TypeScript's `lib` option takes file names — `lib.es2023.d.ts`.

### 35. `if (1)` took the else branch: `jsrt_as_bool` is not ToBoolean
The emitter wrote `if (jsrt_as_bool(cond))` for every condition. `jsrt_as_bool` is
`(v & 1) != 0` — correct for a boxed boolean, whose payload *is* bit 0, and meaningless for
anything else. For `jsrt_number(1.0)` (`0x3FF0...0`) bit 0 is a mantissa bit and happens to be
zero, so `if (1)` ran the `else` branch and `while (n)` never looped.

The same confusion ran through the arithmetic: operands were unwrapped with `jsrt_to_double`,
which reinterprets the 64 bits as an IEEE double. On an actual double that is right; on a boxed
boolean, string, or `null` it reads the tag and payload as a mantissa and produces a garbage
number. So `true + 1` was not `2`, it was noise.

Both are now `jsrt_to_number` (ToNumber) and `jsrt_truthy` (ToBoolean), the real conversions from
`docs/NUMERIC.md` §6.3. `tests/golden/ts/equality.ts` covers the condition cases specifically,
including a `while` whose condition is a bare number.

Worth naming the shape of this bug, because it will recur: the walking skeleton only ever
produced numbers, so a bit-level shortcut and a real conversion were indistinguishable by test.
Two unit tests had been written asserting the shortcut (`assert.match(c, /jsrt_as_bool/)`), which
is the failure mode of testing the emitter's output rather than the program's behaviour — the
tests pinned the bug in place and had to be rewritten, not just re-run.

### 36. Three verifier rules rejected correct IR; STA4005, STA4006 and STA4017 retired
`STA4005`/`STA4006` required `if` and `while` conditions to be `boolean`. Once conditions run
ToBoolean that is simply false: every value is truthy or falsy, so there is nothing to reject.
`STA4017` required `===` operands to have the same type, which rejects `null === undefined` —
legal in JavaScript *and* TypeScript, answering `false`.

All three were true of the Phase 2 fragment and not of the language. That is the distinction a
verifier rule has to meet: an invariant of the IR, not of whatever the IR happened to contain
when the rule was written. Retired in `docs/DIAGNOSTICS.md` (never reused, per its own rule)
rather than loosened, since the replacement is "no rule at all".

### 37. The gate accepted `null` and `undefined` with nowhere to put them
`null` is a keyword, so it passed the gate's token fast-path; `undefined` is an ordinary global
binding, so it passed as an Identifier. Neither had an HIR node. `null` reached the lowering's
catch-all (`STA4031`), and `undefined` was reported as "identifier used before declaration"
(`STA4035`) — an *internal error* for a correct program.

The same gate/HIR vocabulary invariant as entry 30, found the same way: by asking what the gate
lets through rather than what the tests happen to exercise. `NullLiteral` and `UndefinedLiteral`
are now HIR nodes. `undefined` resolves through the binding table first, so a local named
`undefined` shadows the global exactly as it does at runtime.

### 38. Deferred knowingly: `+` on strings is still numeric addition
`"a" + "b"` compiles and evaluates to `NaN` rather than `"ab"`, because `BINARY_EMITTERS['+']`
applies ToNumber to both operands unconditionally. The real `+` checks whether either operand is
a string *after* ToPrimitive and concatenates if so, which needs string concatenation — rung 2 of
the lowering ladder (plan §6 Task 3.3).

Recorded here rather than left implicit because it is a *wrong answer*, not a diagnostic: nothing
in the pipeline currently tells the user that this one operator is incomplete. Rung 2 must land
`jsrt_op_add` and a golden test for `"a" + 1` before any program mixing strings and `+` can be
trusted.

---

## 2026-08-29 — Phase 3 Task 3.3 rung 2 (strings + template literals)

### 39. `'ab' === 'ab'` was `false`: strict equality compared strings by pointer

`jsrt_strict_equals` ended in `return a == b` — a comparison of the two NaN-boxed words. For every
primitive that is *stored in* the word that is exactly right. For a string the word is a pointer,
and two identical literals are two allocations, so the answer was `false`.

Confirmed before writing any code, by compiling the two-line program and diffing against Node:

```
$ node src/cli/main.ts build $S/streq.ts -o $S/streq && node $S/run.mjs $S/streq
false        # 'ab' === 'ab'  — Node says true
false        # 'ab' < 'b'     — Node says true
```

Fixed by giving strings their own arm (`jsrt_string_equals`, content comparison) before the
fall-through. The general lesson is the one entry 35 already paid for: **a bit pattern is only a
value for the types that live in the bits.** Every predicate that ends in `a == b` needs an
explicit answer for each pointer-carrying tag, and the number of those tags only grows.

### 40. `'ab' < 'b'` was `false`: relational comparison ran ToNumber on strings

The second line of the same diff. The four relational operators emitted
`jsrt_to_number(l) < jsrt_to_number(r)`, and ToNumber of `'ab'` is NaN, which makes every
comparison false. Abstract Relational Comparison compares as *text* when both operands are strings
and numerically otherwise.

The first implementation was four near-identical functions and cpd caught it at 1.2%. The fix was
not to deduplicate the copies but to write the algorithm the spec actually describes: a three-way
compare with a fourth outcome.

```c
typedef enum { JSRT_ORDER_LT, JSRT_ORDER_EQ, JSRT_ORDER_GT, JSRT_ORDER_UNORDERED } jsrt_order;
```

Modelling `UNORDERED` explicitly is what keeps NaN honest: `a <= b` is **not** `!(a > b)`, because
NaN makes both false at once. The four operators are now one line each, and the trap is stated in
the type rather than remembered in four places.

### 41. Unit tests pinned the emitter's output, and broke — for the second time

Two tests (`arithmetic operators convert with jsrt_to_number`, `comparison operators use
jsrt_to_number`) asserted the *spelling* of emitted C. Both became false the moment `+` and `<`
moved into the runtime, where they belong — the tests failed on a change that fixed two bugs.

That is now four tests rewritten for this reason (entry 36 covered the first two). Recording it as
a standing rule rather than a third incident:

> **A unit test may assert which runtime function the emitter dispatches to. It may not assert how
> the emitter spells the work.** The first is the codegen↔runtime contract. The second is an
> implementation detail, and pinning it makes the test suite vote against every improvement.

The replacements assert `jsrt_op_add(` / `jsrt_bool(jsrt_op_lt(` appear, and pair each with
`assert.doesNotMatch` against the inline spelling — so the test now fails if the emitter *stops*
delegating, which is the thing actually worth protecting.

### 42. All 152 decision tests asserted the same thing: "modules are not-yet"

Rung 1 and rung 2 both ended unable to satisfy plan §6's per-rung Check — *"the construct's
decision tests flip from expected-fail to passing"*. The reason turned out not to be the rungs.

Every fixture ended in `export { x };`. That line was never the feature under test: it was there to
stop `noUnusedLocals` (Stator policy, `src/frontend/program.ts`, not a user tsconfig) rejecting the
declaration. But `export` is a module construct, modules are Task 3.11, and the gate reports the
first blocker it finds — so all 152 fixtures returned `not-yet STA1214` naming *modules*, whatever
construct they were named after. The suite read `0 passed, 152 expected-fail` and had been inert
since the day it was written.

Fixed by replacing the bare `export { x };` with `console.log(x);` — the only value-consuming
construct in today's subset — and only where doing so was *verified* to produce the fixture's own
declared verdict. The rewrite ran per-file with an automatic revert on mismatch, so no fixture's
meaning was quietly changed to make it pass. 17 fixtures now genuinely pass; the 4 files that
really do test imports were skipped by construction.

> **A decision test must not depend on a construct it does not name.** A fixture named
> `template_literals` that fails on modules is not a weak test, it is a test of something else.

The revert list is itself a finding — it recorded mismatches the export had been masking, which are
now visible and are **not** yet fixed:

- `subset_top_level_await_{ts,js}` declare `STA1208`, the gate answers `STA1201`.
- `subset_with_statement_ts` declares `STA1109`, the gate answers `STA1107`.
- `subset_bigint_primitive_{ts,js}`, `subset_regexp_literal_{ts,js}` and
  `subset_nullish_coalescing_js` fail with `STA0012` — a `tsc` diagnostic, so the fixture or the
  `lib` list in `createProgram` is wrong, not the gate.
- Ten `_js.js` fixtures declare `dynamic` but explain to `static` (the tenth,
  `subset_switch_statement_js`, joined the list in rung 3). This one is probably the
  *directives* being wrong rather than the compiler: `js` mode does not mean "untyped", it means
  "infer what you can", and `const x = 1 + 2` is inferable in either mode. Left alone deliberately —
  changing a declared verdict to match observed behaviour is how a test suite stops being evidence.
  Needs an owner decision against `docs/MODES.md`.

---

## 2026-08-29 — Phase 3 Task 3.3 rung 3 (control flow)

### 43. Rung 3 could not start without rung 1's deferred operators

Every decision test this rung exists to unblock — `for_loop_c_style`, `break_and_continue`,
`labeled_statements`, `while_do_while_loops` — is written with `i++` and `result += i`. Rung 1
deferred both:

> `x += 1` is not `x = x + 1` in general — the target is evaluated once, which matters as soon as
> it can be `a[i()]`.

That reasoning is still right, and the deferral was still wrong for this rung: while the only legal
target is a bare identifier, the target *cannot* have side effects, so the fold is exact. The gate
now enforces the precondition the fold depends on (`ts.isIdentifier(bin.left)`) instead of leaving
it as a comment, and plan §6 rung 5 carries the obligation to revisit when index access lands.

Two shapes, not one, and the difference is easy to miss:

- `x += 1` → `x = x + 1`, using the `+` **operator** — so on a string it concatenates. `'5' += 1`
  is `'51'`.
- `x++` → `x = (+x) + 1`, with an explicit unary `+` — because `++` is defined to run **ToNumber**
  first. `'5'++` is `6`.

The unary `+` is the whole difference. Writing `x++` as `x += 1` would have been a silent wrong
answer for every string, which is why `tests/unit/control-flow.test.ts` asserts the shape rather
than trusting the golden tests to happen to cover it.

`++`/`--` and `+=` are accepted **only where their value is discarded** — an expression statement,
or a `for` header's third slot. That restriction lives in the gate, not the lowering, because the
HIR has no node for a value-producing update and the gate's accept set must equal the HIR's
vocabulary. Letting the syntax through and rejecting it a layer down is the exact shape of
plan-notes 30 and 37.

### 44. `for-of` was scheduled by syntax rather than by dependency

Rung 3 was written as *"`for`, `for-of` (arrays), `switch`, `break`/`continue`, labels"*. But
`for-of` iterates an array, and arrays are rung 5 — so the item could never have been completed in
the rung that listed it. Confirmed rather than assumed:

```
$ node src/cli/main.ts build tests/subset/subset_for_of_loop_ts.ts -o /dev/null
tests/subset/subset_for_of_loop_ts.ts:6:23 STA1214 [ts] array literals is not yet supported
tests/subset/subset_for_of_loop_ts.ts:8:1  STA1214 [ts] for...of loops is not yet supported
```

Moved to rung 5 by editing plan §6 (rule 6: plan changes by edit, not drift). The general lesson is
about how the ladder is ordered:

> **Rungs are ordered by what a construct DEPENDS ON, not by what it is spelled like.** `for-of`
> looks like control flow and is really collection iteration.

The gate's `describeKind` used to fold `for`, `for-of` and `for-in` into one label, "for loops",
which is what made the three look interchangeable. They now report separately.

### 45. The switch decision test was testing functions

`subset_switch_statement_ts.ts` wrapped its switch in a `function` so it could `return` from each
clause — so the fixture could not pass until rung 4. Same defect as plan-notes 42, one rung later
and from a different cause: not scaffolding to satisfy a compiler flag this time, but a construct
reached for out of habit because it makes the example read well.

Rewritten to assign into a variable instead. The rule from entry 42 holds without amendment: **a
decision test must not depend on a construct it does not name.** Worth checking the remaining
expected-fail fixtures against it as each rung lands, rather than discovering it one rung at a time.

### 46. Two emitter traps that produce a program that runs and is wrong

Neither is caught by "does it compile":

- **`continue` in a `for` must still run the update.** The obvious lowering jumps to the top of the
  loop, which skips `i++` and hangs on the first `continue`. The continue target has to sit
  *between* the body and the update. `tests/golden/ts/control-flow.ts` covers it with a `continue`
  at `i === 3`, so a regression is an infinite loop in CI rather than a wrong number.
- **C's `break` is captured by the nearest `switch`.** A JavaScript `break` targeting a loop from
  inside a switch would silently leave the switch instead. Rather than track which construct C
  would bind to, every jump is emitted as a `goto` to an explicit label. Uniform, and immune to the
  capture rule entirely.

That choice creates its own hazard: the runtime builds with `-Wall -Wextra -Werror`, where an
unused label is an **error**, so emitting `brk_N:` after every loop would turn any plain `while`
into a build failure. The emitter therefore records which labels a `goto` actually targets and
writes only those. Every jump is emitted before its own target line, so no second pass is needed.

Also found while writing the golden fixture: `noFallthroughCasesInSwitch` is on in
`src/frontend/program.ts`, so a **non-empty** clause without a `break` is rejected by the frontend
as `STA0012` even though the emitter lays clauses out to fall through naturally. Empty clauses
still stack (`case 0: case 1:`). This is defensible — it is the flag's whole purpose — but it was
undocumented, and a reader of the emitter would reasonably conclude general fall-through is
reachable. Now stated in `docs/HIR.md` and in the fixture.

One bug of my own, caught by the verifier rather than by a test: the compound-assignment fold
typed its result `H_NUMBER` unconditionally, so `text += 1` on a string produced
`STA4004 assignment target type string does not match value type number`. The type has to come from
the checker, since `+=` inherits `+`'s string behaviour. The verifier earning its keep on a bug
introduced in the same change is the argument for having it.

### 47. Stator was enforcing its own lint policy on the programs it compiles

`src/frontend/program.ts` builds the `ts.Program` for **user source** from a `compilerOptions`
literal that had been copied from the locked `tsconfig.json` in plan §4 — including
`noUnusedLocals` and `noUnusedParameters`. Those two govern *Stator's* source, not the source
Stator compiles, and the difference is not cosmetic: with them on, `function f(a, b) { return a; }`
is a hard `STA0012`, so Stator rejected a correct TypeScript program. A `tsc` user can switch them
off in their own tsconfig; a Stator user cannot, because Stator ignores their tsconfig for exactly
these options. They are also the only two options in that list that change nothing about what a
type *means*, so nothing downstream could have depended on them. Removed from the frontend; the
compiler's own `tsconfig.json` keeps both.

Found because the fixture below could not be fixed without it, but the same defect had a second and
worse instance. `strict: true` implies `noImplicitAny`, and js mode was inheriting it — so an
unannotated JavaScript parameter was a compile error in the mode whose entire contract is
"untyped code is never rejected" (`CLAUDE.md`, plan §1). The gate's own implicit-any rule
(`STA1001`, ts mode only) was unreachable for js because tsc rejected the file first. Now
`noImplicitAny: mode === 'ts'`, which is the one place in `createProgram` where a mode-dependent
option is correct: it *is* the mode policy, stated where the mode still exists.

Effect on the decision matrix: `subset_implicit_any_js.js` went from expected-fail to passing with
verdict `dynamic`, which is what plan §1.2 always said it should be.

### 48. Nothing ever checked that an expected-fail marker was still true

`tests/subset/run.ts` counted `// @expected-fail: true` fixtures and `continue`d past them without
evaluating. `AGENTS.md` says the runner "reports (never hides)" the count, and it did — but the
count is not the property that matters. A marker records *the fixture is ahead of the
implementation*, which stops being true the moment the implementation lands, and nothing detected
that transition. The marker then silently exempts a fixture that would now be holding the line, so
the suite quietly shrinks while its headline number stays reassuring.

The runner now evaluates every fixture, expected-fail included, and reports
`now passes — remove the @expected-fail marker` as a **failure** when one matches its declared
verdict and code. A fixture that still throws or mismatches is counted as expected-fail exactly as
before, so the marker keeps its meaning; it just cannot outlive its reason.

Turning it on found **seven** stale markers, only one of which belonged to the rung being worked
on: `subset_async_functions_generators_{ts,js}` (gate answers `STA1201` correctly — a decision test
asserts a verdict, not an implementation), `subset_explicit_any_ts`, `subset_implicit_any_ts`,
`subset_type_annotations_{ts,js}`, and `subset_implicit_any_js` from entry 47. All seven were
verified against `explain --json` before the markers came off. Passing fixtures went 26 → 35 with
no new implementation work — the suite had that coverage already and was declining to use it.

### 49. Rung 4 split into 4a (calls) and 4b (captures), and what 4a leaves standing

Plan §6 rung 4 reads "Functions + closures: environment structs, capture analysis, recursion",
which is two rungs wearing one number. Recursion needs no environment: a self-call resolves through
a *module-level* binding, and `gateIdentifier` already accepts those (a reference whose declaration
has no enclosing function is not a capture). Capturing a function **local** is the part that needs
environment structs. Split, mirroring the 1a/1b precedent: **4a** = functions, parameters, `return`,
calls, recursion and mutual recursion, no captured locals; **4b** = captures and environment
structs. 4a is complete.

The split has a consequence in the emitter worth recording. Module-level bindings can no longer
live in `main`'s frame, because a function body may legally read them; they moved to a file-static
`JSRT_GLOBALS(n)` array whose frame is pushed once at `jsrt_init` time and never popped. `main`
therefore has no `JSRT_FRAME_POP()` — deliberately, since the frame must outlive every call that
can still reach a global. `STA4042` (return outside a function) exists to keep a stray `return`
from popping it.

Two ceilings 4a does not lift. Printing a function in ts mode is not expressible: the `console.log`
shim takes `string | number | boolean | null | undefined`, so the `[Function: name]` branch in
`jsrt_print` is currently reachable only from js mode. And arithmetic on an unannotated js-mode
parameter still stops at `STA4011 arithmetic operand must be number, got unknown` — correct as a
*schedule* (the dynamic representation is Phase 8) but wrong as a *shape*: it is an `STA4xxx`
internal error telling a user who wrote ordinary JavaScript that they found a compiler bug. It
should be an `STA12xx` not-yet naming Phase 8, like `eval` already is. Fixing it means deciding
where the check belongs — the verifier has no mode by design (plan §0.8), so it cannot be there —
and that is a Phase-8 design question, not a rung-4 one. Recorded, not fixed. The js golden fixture
stays inside the pass-through subset for this reason.

---

### 50. Rung 4b's environment representation is decided by the rooting protocol, not by convenience

Rung 4b says "environment structs, capture analysis" and "a closure becomes heap-allocated with an
environment pointer". That leaves the representation open, and the obvious implementations are all
wrong for a reason that is not visible from the rung's own text — it is visible from
`docs/VALUE.md` §4.1, which says the rooting protocol exists so that §12's precise generational GC
does **not** require a codegen rewrite, citing Boa's history via plan §0.7. Every 4b decision below
falls out of that one constraint. Recording them before writing code, because getting this wrong
produces a rung that passes every test under today's Boehm/no-collection runtime and has to be
rewritten wholesale when §12 lands — the exact debt §4.1 exists to prevent.

**Environments, not bare cells.** The textbook lowering gives each captured variable its own heap
cell and holds `JSRTCell *` in a C local. Under Boehm that works, because the conservative
collector scans the machine stack and finds the pointer. Under §12's *exact* root set it is
invisible: nothing in a frame points at the cell, so it is collected while still in use. The
storage must therefore be a `JSRTEnv` reachable by tracing `closure → env → slots`, so a captured
value is found the same way every other live value is.

**The declaring function has to root its own environment.** Tracing through the closure is only
enough once a closure exists and while one is still alive. Between `jsrt_env_new` and the first
closure created from it — and in a function that outlives every closure it made, while still
reading its own captured locals — nothing in the exact root set points at the env. So the env has
to be rooted by the function itself. This is the part that is easy to skip and impossible to
retrofit cheaply, and it is the whole reason this entry exists.

*Corrected while implementing:* this entry first said the env pointer should become a rooted
`jsrt_value` under a new `JSRT_TAG_ENV`. **There is no free tag.** `jsrt_tag` masks with `0x7` — a
3-bit field — and all eight values are allocated (`UNDEFINED NULL BOOL INT32 OBJECT STRING ARRAY
CLOSURE`). Widening the field would take a bit from the 13-bit `JSRT_NANBOX_MASK`, which
`docs/VALUE.md` reserves deliberately so only negative quiet NaNs are tags and the whole positive
NaN space stays available to doubles. An env is not a JavaScript value and does not need to be one:
the root-set unit is the **frame**, so `JSRTFrame` grows a `JSRTEnv *env` field that the collector
traces alongside the frame's slots. `JSRT_FRAME(n)` initialises it to `NULL`; a function with
captured locals points it at its own env. This roots the env exactly, costs no tag, and leaves the
value representation untouched — strictly better than what this entry originally proposed.

**Chain, not flat.** Flat closure conversion copies every transitively-free variable into each
closure's env. Copying a *value* breaks shared mutation (the inner function must see a write the
outer makes afterwards); copying a *pointer to shared storage* reintroduces the cell this entry
just rejected. A parent chain (`env->parent`) keeps one env per env-bearing scope and resolves a
name to (levels-up, index), both compile-time constants the emitter already has from capture
analysis. Only scopes that actually own captured variables get a level, so the walk is over
env-bearing scopes and not over source nesting depth.

**Non-capturing functions keep 4a's static closure.** A function that captures nothing has
`env = NULL` and stays a file-static `_jsrt_closure_N` constant. Only a function with captures
becomes heap-allocated per evaluation, which is what makes two evaluations of the same function
expression close over different variables. 4a's zero-allocation path survives 4b unchanged.

Consequence for the runtime contract: `JSRTClosure.fn` grows an env parameter, so *every* generated
function's C signature changes, non-capturing ones included — `jsrt_call` cannot know which kind it
is dispatching to. That is a `docs/VALUE.md` change, not just an emitter change.

---

### 51. A nested function's own name looked like a capture of itself

Capture analysis walks every identifier and asks the checker where it was declared. The name in
`function c() { … }` is an identifier that resolves to `c`'s own declaration — and that name node
lives *inside* `c`'s subtree, so `enclosingFunction(name)` is `c` while `enclosingFunction(decl)` is
the function around it. The two differ, which is exactly the test for "this is a cross-function
reference", so **every nested function declaration was recorded as a variable its parent must
capture**.

The generated code was not wrong — the emitter stores hoisted function declarations into env slots,
so reading one back through the environment worked. It was wrong about *cost*: a parent holding
nothing but a nested `function` still allocated a heap environment, and the nested function still
lost the file-static closure to a per-call `jsrt_closure_new`. That is the one property entry 50
promised 4b would preserve ("4a's zero-allocation path survives 4b unchanged"), quietly given up on
every function that declares a helper inside itself.

Evidence, `function a(){ const outerVar=1; function b(){ const innerVar=2; function c(){ return
outerVar+innerVar } … } … }`, before and after:

```
a {"envVars":["b","outerVar"],…}          a {"envVars":["outerVar"],…}
b {"envVars":["c","innerVar"],…}          b {"envVars":["innerVar"],…}
```

Fix: skip an identifier that *is* the declaration's own name (`ts.getNameOfDeclaration(decl) ===
node`). Found by writing the unit tests for `analyzeCaptures`, not by any golden fixture — the
fixtures only observe printed output, and this defect changes allocation, not values. It is the
argument for pinning an analysis directly rather than only through what it emits.

### 52. Rung 4b compiles a captured loop variable to the wrong value, so the gate rejects it

`for (let i = 0; …)` gives each iteration a *fresh* `i`; a closure built in iteration 0 must keep
reading 0 after the loop moves on. Rung 4b allocates one environment per **call**, so all iterations
share one slot and every closure reads the final value. Written as a golden fixture it produced
`2, 2` where Node produces `0, 1`.

Two honest options: implement per-iteration environments, or refuse the construct. Per-iteration
environments are a loop-lowering change (allocate in the loop, copy the previous iteration's value
across the update) and belong to whichever rung gives loops their own scopes. Phase 5 step 3 already
owes a golden test for "loop-var closure capture" when it lowers `var`, which is the same machinery
seen from the other side — the two should land together rather than 4b guessing at half of it. What
is *not* an option is emitting a program that runs and prints the wrong number, so the
gate now rejects the shape as `STA1214` (not-yet, Phase 3): an identifier whose declaration sits
inside a loop within the declaring function, referenced from a nested function.

The rejection is deliberately an over-approximation of the broken case — it also refuses a captured
binding declared in a loop *body*, which has the same per-iteration semantics and the same defect.
A closure over a variable declared **outside** the loop is unaffected and is covered by the golden
fixture (`drive()`), because there genuinely is one binding and one slot.

### 53. `noUncheckedIndexedAccess` makes an indexed read `T | undefined`, and that is the point

Rung 5's plan text asks for index access "which brings compound assignment and `++`/`--` to a target
that can have side effects". Writing that program shows it does not currently typecheck:

```
$ node src/cli/main.ts build probe.ts -o /tmp/probeout --mode=ts
probe.ts:13:23 STA0012 [ts] Object is possibly 'undefined'.   // indexed = indexed + a[i];
probe.ts:18:1  STA0012 [ts] Object is possibly 'undefined.'   // a[1] += 5;
```

`a.length`, `console.log(a[0])`, `for (const x of a)` and `a[0] = 10` all compile. What fails is
every read of `a[i]` into a context that wants a `number` — because plan §4 Task 1.0 turns on
`noUncheckedIndexedAccess` for user source, so `a[i]` is `number | undefined`.

**This stays on.** Turning it off would make `HArray`'s element type a claim the emitter is entitled
to act on and the runtime cannot honour: an out-of-range read yields `undefined`, and rung 1b's i32
refinement plus every later unboxing pass exist precisely to trust a `number` as a machine double.
That is golden rule 4 — never trust a type annotation across a boundary — and an index is a
boundary. The flag is also the conservative direction: relaxing it later is compatible, imposing it
later breaks user programs.

The consequence is that `a[i]` lands in the HIR as `Unknown`, and the thing that turns it back into
`number` is **Task 3.5, boundary-check insertion** — the pass whose whole job is materializing a
runtime check where `Unknown` narrows to a concrete HType. `noUncheckedIndexedAccess` is what creates
the narrowing site for it to find; without the flag there would be nothing to insert a check at, and
the "elide bounds checks when the index is provably in range" half of rung 5 would have no check to
elide. So rung 5 delivers the *representation* (dense storage, `jsrt_array_get/set` with their own
in-range test, `.length`, `for-of`, index write) and 3.5 delivers the typed read.

Two knock-on facts, recorded so neither reads as an oversight later:

- **`for (const x of a)` binds the element type, not `T | undefined`** — TypeScript models iteration
  as yielding `T`. That is what keeps ordinary typed iteration on the static path today, and it is
  the idiom rung 5's golden fixture uses.
- **Compound assignment to an element (`a[i] += 1`) is unwritable in *both* modes** until 3.5,
  since even in js mode `const a = [1, 2, 3]` infers `number[]`. The gate still accepts the shape
  and the lowering still implements plan-notes 43's read-once rule, because the load-bearing
  invariant is that the gate's accept set equals the HIR's vocabulary — a construct the HIR can
  express must not be rejected by the gate. It is pinned by a lowering unit test rather than a
  golden test, and the golden test arrives with 3.5.

### 54. A binding's HType came from what it was initialized with, not from what it was declared as

Found while testing rung 5's array literals. `const a: unknown[] = [1, 2]` was binding `number[]`,
because the lowering built the Declaration from `value.type`. The general shape of that bug is not
about arrays at all:

```
$ node src/cli/main.ts build decl.ts -o /tmp/decl --mode=ts   # let x: string | number = 1; x = 'a';
stator: STA4004 internal error in assignment: assignment target type number does not match value type string
stator: this is a compiler bug — please report it with the input
```

Legal TypeScript, reported as a compiler bug. An annotation may be WIDER than the initializer, and
the declared type is what the slot may hold over its whole life; the initializer only says what it
held first. Worse than the spurious diagnostic is the silent half: a later pass entitled to unbox a
`number` slot would have unboxed one that can hold a string.

Two changes, both narrowing the compiler's claims rather than widening them:

- The Declaration takes `checker.getTypeAtLocation(decl.name)` — the binding's type, which is the
  annotation when there is one and the widened initializer type otherwise.
- Assignment into an `unknown` binding verifies clean. `string | number` has no HType, so it is
  Unknown, and every assignment to it is legal precisely because nothing was promised about it.
  This is the same exemption a call's callee already had (STA4041) and an index target now has
  (STA4044): Unknown accepts anything, because that is what the dynamic path IS.

Two decision tests moved as a result, and both moved toward the honest answer:
`subset_nullish_coalescing_ts.ts` is now `dynamic`, because its `const x: number | null` really is
a binding HType cannot describe (it flips back to static when unions land), and
`subset_explicit_any_js.ts` lost a stale `@expected-fail` — `const x: any = 42` now types as
Unknown rather than as the `42` it happened to start with, which is the whole point of `any`.

### 55. Rung 5's dense array cannot represent a hole, so it refuses to make one

`a[3] = 'y'` on an array of length 1 leaves indices 1 and 2 genuinely ABSENT in ECMA-262. It is
observable in the most ordinary way there is:

```
node:   [ 'x', <2 empty items>, 'y' ]
stator: [ 'x', undefined, undefined, 'y' ]
```

The first implementation filled the gap with `undefined` and documented it as a ceiling. That is
the failure mode plan-notes 52 refused for captured loop variables — a program that runs and
prints the wrong answer — and a golden test could not have covered it without being loosened.

Real holes need a sentinel distinct from `undefined` plus the matching arm of Node's
`groupArrayElements`, which is object-model work. So `jsrt_array_set` refuses instead: a write more
than one past the end raises `STA2002` at runtime, the second runtime-emitted diagnostic after
`STA2001`. What that costs is nothing users actually write — replacing an element and appending at
`a[a.length]` both stay, and the counted-loop build `for (…) a[a.length] = …` is the golden
fixture. What it buys is that every array a Stator program can build prints exactly what Node
prints.

### 56. The ladder's next rung is an optimization whose Check does not exist yet

Working top-down after rung 5, the next unmet item is rung **1b**, the i32 refinement. Its stated
precondition is met — `NUMERIC.md` §11 wants §10's tests passing on the f64 path first, and they
are. But §11 also says, in the same paragraph:

> Introducing `i32` is therefore a change that can only *break* things: there is no correctness
> argument for it, only a performance one.

A change justified only by performance needs a performance measurement, and there is none. What
`tests/bench/baseline.json` holds is compile wall-time and binary size:

```
"note": "compileMsBest is the minimum of runsPerFixture wall-clock measurements of `stator build`,
         including Node startup and the clang invocation."
```

That is exactly what plan §5 Task 2.7 asked for, and it says nothing about how fast the emitted
program runs. The compute set that would — fib, nbody, JSON round-trip, string churn — is **Task
6.3**, in Phase 6. So the ladder as written schedules a measured optimization three phases before
its measurement.

Three ways out, and why the third wins:

- **Land 1b unmeasured.** It would be a claim of done on a Check that cannot be run (golden rule 1),
  for a change whose own spec says it can only break things. No.
- **Build Task 6.3's harness now.** Timing a binary is a few lines on top of `tests/bench/record.ts`,
  but the measurement is worthless without fixtures that actually stress numeric loops — so this is
  Task 6.3's substance, not its scaffolding, pulled into Phase 3 to justify one optimization.
- **Defer 1b and say so in the plan.** Nothing depends on it: no `i32` is half-built (`VALUE.md` §5
  still lists the tag as layout only, never emitted), HType has no `i32` kind, and rungs 2–5 all
  landed on the f64 path without wanting one. The cost of waiting is zero and the cost of guessing
  is a performance change nobody can defend.

**plan.md edited:** yes — rung 1b now records the real precondition and points at Task 6.3, and the
ladder continues at rung 6.

---

## 57. A class's field ORDER cannot be read off its member nodes, because a `.js` class has none

**Evidence.** Rung 6a's first working draft built the slot list twice: `classTypeToHType` walked
`declaration.members` for `ts.isPropertyDeclaration`, and `lowerClass` walked the same list again to
build the descriptor the emitter writes. In a `.ts` class the two agreed. In js mode, the fixture
`tests/subset/subset_class_fixed_shape_js.js`:

```js
class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}
```

has **no `PropertyDeclaration` at all** — a JS field is declared by `this.x = …` in the constructor,
and TypeScript infers it. Both walks returned an empty list, so the emitted `JSRTClass` would have
claimed zero fields while the constructor wrote slots 0 and 1 of a zero-slot allocation.

**Why it is a plan-level note and not just a bug.** The fix is not "also look at constructor
assignments". It is that the checker's property list is the *only* authority on the layout, because
it is the only one that answers the same way for both modes — and the two derivations were a second
authority waiting to disagree. `classTypeToHType` now iterates `checker.getPropertiesOfType`, and
`lowerClass` derives its `fields` from the resulting `HObject.fields` rather than re-walking. The
descriptor and every `FieldAccess.slot` now come from one list by construction.

This is the same shape of error as plan-notes 54 (a binding's type taken from its initializer rather
than its declaration): two paths to one fact, agreeing on the common case.

**Consequence for the mode contract, which is the good news.** A js-mode class gets the *same*
fixed-slot layout as a ts-mode one, with `unknown` field types — so `subset_class_fixed_shape_js.js`
is `dynamic`, not `not-yet`. The dynamic path here is about what the slots HOLD, not about whether
the object has slots. That is `SUBSET.md`'s "static if fully typed, else dynamic" read literally.

**plan.md edited:** no — this confirms the rung as specified rather than contradicting it.
`docs/SUBSET.md`'s fixed-shape row now records where the slot order comes from.

---

## 58. `this` did not need a node, and that is what made rung 6a small

**The decision.** A constructor or method lowers to an ordinary `FunctionExpr` whose parameter list
begins with a receiver under the unspellable name `' this'`, and `this` in the body lowers to an
`Identifier` reading it. There is no `ThisExpr` in the HIR and no receiver field on `FunctionExpr`.

**Why record it.** Every alternative costs machinery that then has to be maintained by every pass:

- A `this` node needs a case in the verifier, the emitter, both `explain.ts` walkers, and every
  future pass — to express something the existing `Identifier` case already expresses correctly.
- A `receiver` field on `FunctionExpr` splits the calling convention in two: `jsrt_call` would need
  to know whether to pass one, and `MethodCall` and `CallExpr` would stop sharing a layout.

With the parameter reduction, a method inherits **unchanged**: the closure ABI, `jsrt_arg`'s
padding of missing arguments, the static-closure fast path for non-capturing functions, and capture
analysis — including the case that would otherwise be hardest, an arrow inside a method closing over
`this`, which is now just an arrow capturing a parameter. `MethodCall` and `NewExpr` reuse
`CallExpr`'s contiguous-slot layout with the receiver where the callee slot would be.

The one real cost: `analyzeCaptures`'s `FunctionLike` had to grow `MethodDeclaration` and
`ConstructorDeclaration`, because a method IS a scope boundary. That was two lines, and the rest of
the analysis was already generic over the union.

**The constraint it imposes.** The receiver name must stay unspellable. `tests/unit/classes.test.ts`
asserts it does not start with an identifier character, so a later refactor that "tidies" it to
`this` would fail rather than silently let a user binding shadow the receiver.

**plan.md edited:** no. `docs/HIR.md` §1.3 records the reduction and the two invariants beside it.

---

## 59. Rung 6 split into 6a and 6b, on the line where the fixed-slot layout stops working

**6a (done):** classes with fields, one constructor, instance methods, field initializers, `new`,
`this`, field read/write in every assignment form, and method calls.

**6b (not started):** inheritance and `super`, `instanceof`, static members, `#private` fields,
getters/setters (which take the dynamic path per `SUBSET.md`), object literals, and ToPrimitive /
loose equality with objects.

**The line is not arbitrary.** Each 6b item breaks a property 6a's layout depends on:

| Deferred | What it breaks |
|---|---|
| `extends` / `super` | A subclass's layout must start with the parent's, and a method may be overridden — so the compile-time call resolution `MethodCall` performs stops being sound |
| getters / setters | A field READ becomes a call; `SUBSET.md` already routes such classes to the dynamic path |
| `static` members | Belong to the class object, which is a second allocation 6a does not make |
| `#private` | Needs a name that cannot collide with an inherited one — i.e. it needs inheritance first |
| a class as a VALUE | Same: passing `C` needs the class object. Gated out with a `not-yet`, so it fails loudly rather than becoming an internal error |
| object literals | A shape with no declaration to allocate a descriptor for |

Each is a `not-yet` in `gateClass`/`gateNew`/`gateIdentifier` with its own message, so the failure
names the construct rather than the phase.

**plan.md edited:** yes — rung 6 now records the split and 6a's completion.

---

## 60. `a == a` was false: rungs 5 and 6a shipped an object-blind `==`, `+`, and `<`

**Found while starting rung 6b.** The ToPrimitive item was listed as a rung 6b *feature*. It is
not — it is a correctness bug that has been live since rung 5 (arrays), and rung 6a (classes)
widened it. Four runtime abstract operations each had an object-shaped hole:

| Function | Hole | Consequence |
|---|---|---|
| `jsrt_loose_equals` | no object row at all; fell to `return false` | `a == a` was **false** and `a != a` was **true** for every array and every class instance |
| `jsrt_to_number` | objects returned NaN | `-[5]` was NaN, `[5] \| 0` was 0 |
| `jsrt_op_add` | tested "either is a string" BEFORE converting | `[1] + [2]` was NaN, not `"12"` |
| `jsrt_compare` | tested "both are strings" BEFORE converting | `["10"] < ["9"]` would compare numerically |

`===`, template literals, and `console.log` were all correct throughout, which is why no golden
test caught it: every fixture that touched an object used one of those three. A probe of 22
expressions against Node found 12 mismatches, all in these four functions; all 12 now agree.

**The fix is one function.** `jsrt_to_primitive` (`runtime/src/jsrt_ops.c`) runs first in each of
the four, and a primitive passes through untouched — so there is one place the spec's ordering can
be right or wrong, not four. It takes **no hint parameter**, and that is a subset fact rather than
a shortcut: the hint only chooses whether `valueOf` or `toString` is tried first, and no object in
the subset has a user `valueOf`, so both hints reach `toString`. `docs/NUMERIC.md` §7 records when
the parameter goes in.

**A second defect fell out of testing it.** The verifier required arithmetic operands to be exactly
`number` (`STA4011`/`STA4012`), so `id(a) - 1` in js mode — legal source the gate accepts — reached
an *internal error*. The emitter has always wrapped every arithmetic operand in `jsrt_to_number`,
which is total, so the rule described the Phase 2 fragment rather than the language; it now admits
`unknown` and still rejects a known non-number. This is the same shape as the retired `STA4014`/
`STA4015`, and it means the gate's accept set was wider than the HIR's vocabulary — the one
invariant plan §0 calls load-bearing. Worth checking the remaining verifier operand rules against
what the emitter actually supports rather than against what rung 1 emitted.

**Not fixed here, recorded for its own change:** `String(x)` produces `STA4035 identifier 'String'
used before declaration` — an internal error for legal source. The gate accepts any identifier with
a resolved symbol, including TypeScript's lib globals, and the lowering has no binding for them.
That should be a `not-yet` from the gate.

**plan.md edited:** yes — rung 6b now lists ToPrimitive as done, with the reason it was not a
feature.

---

## 61. The gate accepted every global and the lowering had a binding for none of them

**The defect recorded at the end of entry 60, fixed.** `String(1)` answered
`STA4035 identifier 'String' used before declaration` — an **internal error**, raised by legal
source. So did `Number`, `parseInt`, `NaN`, `Infinity`, `Math`, `globalThis`, and `console` used as
a value. `gateIdentifier` accepted any identifier whose declaration sat in the same function scope
as its use, and a lib declaration sits at top level, which is the same scope as top-level user
code; the lowering then built bindings only for declarations it lowers, and found nothing.

This is the load-bearing invariant failing in the direction that costs the compiler its own
credibility rather than the user a feature: **the accept set must equal the HIR's vocabulary**, and
the HIR has no vocabulary for the global object. Now a `not-yet` naming Phase 4 (builtins).

**Three spellings only MENTION a global name and had to stay accepted**, each for its own reason —
they are position facts, not syntax facts, which is why they get unit tests rather than decision
tests:

| Spelling | Why it is not a reference |
|---|---|
| `x: String`, `Array<number>` | A type position erases; there is nothing to lower |
| `s.length`, `p.x` | A property NAME is answered by the object's shape, never by scope. That `length` resolves to a lib declaration is an accident of where the type came from |
| `console` in `console.log(x)` | The whole call is one HIR node `gateCall` already vetted, and the walker descends into its children anyway |

**`undefined` is exempted by name, and that is deliberate rather than lazy.** The lowering
special-cases it by name too (`src/lower/index.ts`), so the two sides agree on one single
exception. Both let a user binding of that name win, as the runtime does.

**Two false starts worth recording.** A test on `symbol.valueDeclaration` misses `globalThis` and
`undefined`: the checker synthesizes both, and they have a symbol with **zero** declarations rather
than one in a lib file. And `isDeclarationFile` on a single declaration is not enough — the test is
over *all* of them (`every`), so a name that is also declared in user code stays a user binding.

**Not a regression risk for `NaN`/`Infinity` specifically:** neither ever worked. `tests/golden/ts/
equality.ts` spells NaN as `0 / 0`, which is why nothing caught this.

**plan.md edited:** yes — Phase 4's builtins task now records that the gate defers globals rather
than crashing on them.

---

## 62. `getPropertiesOfType` is own-first, which is the opposite of a prefix layout

**Where:** `src/frontend/types.ts` `classTypeToHType`.

**Evidence.** For `class B extends A { b1 } ` over `class A { a1 }`, the checker's property list is
`[b1, a1]` — own properties first, inherited after. A subclass's layout has to be the reverse: its
slots must START with its base's, in the base's own slot order, or a base-typed read of a subclass
instance lands on the wrong slot. That prefix property is the only thing making `hTypeAssignable`
sound — a `Dog` is a legal value for an `Animal` binding because the first N slots of a `Dog` *are*
an `Animal`.

**First attempt, and why it was wrong.** Ranking each property by its declaring class and
stable-sorting root-first fixes the ts-mode case and silently breaks js mode. A `.js` field is
declared by `this.x = …` in a constructor, so its "declaring class" is not a member node's parent,
and a field assigned in **both** the base and the subclass has a declaration in each. `js/
inheritance.js` caught it: `Counter` assigns `this.count, this.name`; `Stepped` assigns
`this.name, this.step`. Ranking gave `Stepped` the layout `name, count, step` while `Counter`'s own
layout is `count, name` — so the base's `report()` read `this.count` out of `name`'s slot and
printed `2: stepped` instead of `stepped: 1`.

**What landed.** The list is rebuilt from the chain root-first, asking **each ancestor** for its own
property list and skipping names an ancestor already claimed. Each class's list is
own-first-then-inherited, and by the time it is reached every inherited name is claimed, so what
survives is exactly that class's own properties in its own declaration order. First-claim-wins is
also what gives a doubly-assigned `.js` field one slot, at the base's index. No sort is involved;
sorting a merged list cannot express "the base's order" at all.

**plan.md edited:** yes — rung 6b now records inheritance as done.

---

## 63. Method overriding is deferred *separately* from inheritance, and that is the whole design

**The line.** Static dispatch is sound **exactly** while no method is overridden: one name resolves
to one function for every receiver whose type has that class in its ancestry. So inheritance splits
the same way rung 6 did:

- **Landed:** `extends`, `super(...)`, prefix layout, assignability, `instanceof` up the chain,
  synthesized derived constructors. `MethodCall.className` became the class that **declares** the
  method rather than the receiver's own — `d.describe()` on a `Dog` names `Animal` — which is a
  direct call to the one function that exists.
- **Deferred with the vtable:** redeclaring an inherited member, and `super.method()`. Both are
  refused at the gate with a message naming the reason, in both modes. `super.method()` is a call
  that deliberately skips a lookup, which means nothing until there is something to skip.

**Why not just ship vtables now.** The same reason 6a shipped before 6b: a vtable changes what a
`JSRTClass` *is* (a method table, an index per method, a per-class dispatch array) and what a call
site emits, while everything above is a layout question that the existing descriptor answers with
one added pointer. Landing them together would have made one change whose two halves fail for
unrelated reasons.

**Three invariant violations found on the way**, each the load-bearing invariant in the direction
that raises an internal error for legal source:

1. `d.describe()` on an inherited method reached the emitter as `class Dog has no method describe`,
   because the node named the receiver's class.
2. `super.m()` reached the lowering as `STA4031 unexpected expression kind: SuperKeyword`. The gate
   accepted it because `super`'s type IS the base class, so every member-access test passed. The
   refusal now sits in `gateMemberAccess`, where the receiver is examined.
3. A `case ts.SyntaxKind.SuperKeyword:` added to the middle of `visitNode`'s fall-through group made
   `HeritageClause` and `ExpressionWithTypeArguments` fall into it, so every `extends` clause was
   rejected as "super as a value". Caught by the golden fixtures, not by typecheck — a fall-through
   group is a place where adding a `return` is a semantic change to the cases above it.

**Also fixed here:** field initializers were prepended at index 0 of a constructor body, which is
wrong once there is a `super(...)` at index 0 — an initializer may read a field the base wrote
(`doubled = this.sides * 2`). They now go after the super call, which is where JavaScript runs them.

**plan.md edited:** yes.

---

## 64. `this` and `super` were gated by dead code: a token short-circuit swallowed both cases

**Where:** `src/frontend/gate.ts` `gateConstruct`.

**Evidence.** The walker opens with

```ts
if (kind <= ts.SyntaxKind.LastToken && kind !== ts.SyntaxKind.Identifier) {
  return { kind: 'accept' };
}
```

which is right for punctuation and operator keywords. But `ThisKeyword` and `SuperKeyword` are
**tokens**, so `case ts.SyntaxKind.ThisKeyword: return gateThis(node)` had never run — not once,
since it was written. `console.log(this)` at module scope reached the lowering and answered
`STA4061 this outside a class member`, an internal error raised by six characters of legal
JavaScript. The same hole is why the `SuperKeyword` case added for inheritance did nothing, and why
the fix that actually worked for `super.m()` was the one in `gateMemberAccess`.

**What landed.** The exemption list is now `Identifier`, `ThisKeyword`, `SuperKeyword` — the three
tokens that are *expressions reading something* rather than punctuation. Both cases are live, and
`tests/unit/gate.test.ts` pins `this` at module scope as a `not-yet`.

**One case the live check then got wrong, and the fix.** `gateThis` walked up looking for a
constructor or method, so a `this` in a FIELD INITIALIZER (`b = this.a + 1`) — lexically inside no
function — was rejected. `tests/golden/ts/inheritance.ts` caught it immediately. A property
declaration is a `this` position: the lowering moves the initializer into the constructor, where the
receiver is a parameter. Statics are the exception in the other direction — `this` in a static member
is the class object, which this model does not build.

**Lesson worth keeping:** a `switch` on `ts.SyntaxKind` with an early-out over a kind RANGE has no
compiler check that a later case is reachable. Both dead cases typechecked, linted and read
correctly. This is the third invariant leak of the same family this phase (plan-notes 63) and the
only one no test could have caught by construction — nothing was wrong, something was missing.

**plan.md edited:** yes.

---

## 65. Statics are bindings, not slots — and `Unknown` had to become assignable in both directions

**The model.** A static belongs to the class object; there is no class object in this subset. So a
static is ONE binding for the whole program, named `C.count` — a dot is unspellable in an
identifier, the same trick `RECEIVER` plays with a leading space. Everything follows: a read is an
`Identifier`, a write is an `Assignment`, `C.m()` is a `CallExpr`, and `C.count += 1` reuses the
identifier compound-assignment path unchanged, because a plain binding has no place to evaluate
exactly once. Statics needed **no HIR node, no verifier case and no emitter case** — only a
`statics: readonly Declaration[]` list on `ClassDeclaration` that the enclosing scope walks.

Two details are load-bearing. The name carries the **declaring** class, because statics are
inherited: `Sub.count` and `Base.count` are one static, and mangling by the receiver's spelling
would make a write through one invisible through the other. And names are registered in one pass
before any value is lowered (and again in the verifier), for the reason function declarations hoist
— one static method may call another written below it.

**A pre-existing bug this surfaced.** `hTypeAssignable` demanded exact equality unless the TARGET
was Unknown, so an Unknown VALUE flowing into a typed binding was `STA4004`. That is ordinary
js-mode source:

```js
function add(a, b) { return a + b; }
let total = 0;
total = add(total, 3);   // STA4004: target type number does not match value type unknown
```

Six lines, no classes, internal error. Unknown is now assignable in **both** directions, which is
what the dynamic path means: an Unknown target promises nothing, and an Unknown value is a boxed
`jsrt_value` like every other, stored by a total operation. It is the same exemption arithmetic
operands already got (plan-notes 60's second defect) — the pattern is that a verifier rule written
for ts mode becomes an internal error in js mode wherever it demands a static fact the checker
cannot supply.

**`isClassInstance` had to stop believing the checker.** The type of the expression `C` is the
class's STATIC side, whose symbol is still the class declaration — so `tsTypeToHType` answered
`object` for a class NAME, naming the very layout `new C()` produces, and `C.m()` lowered as an
instance method call on `C`. Only the spelling separates the two, so the test now asks the AST.

**Deferred, with reasons:** a `static {}` initialization block and `this` in a static member (both
need the class object), overriding an inherited static (`D.count` and `C.count` must be one
binding), and `C.name`/`C.prototype` (the class object again).

**plan.md edited:** yes — rung 6b now records statics as done.

## Open items carried forward

- **Phase 0 is not approved.** `NICHE.md` does not exist and no `phase-0-approved` tag has been
  created. An agent must not self-approve it (plan §3 Task 0.1 step 4). Phase 1 *and* Phase 2
  work proceeded on explicit owner instruction (entries 22 above). Still the owner's call.
- **No commits exist yet.** The whole tree is staged and uncommitted, so plan §4 Task 1.0's
  "fresh clone" wording and the `phase-0-approved` tag are both unverifiable until the initial
  commit lands.
- ~~**`stator explain --json` schema**~~ — resolved, see entry 12 above.

## 66. `#private` is a printing rule, and a corpus that lagged a struct change proved it

**The implementation is nearly empty, and that is the finding.** A `#private` member is an ordinary
member all the way down: `#count` takes a slot in declaration order, `#step()` is a member function,
`static #next` is a static binding named `C.#next`. Nothing below the gate enforces privacy, because
the checker already has: `o.#x` from outside the class body is a TypeScript error before the gate
runs, and js mode gets the same check for free since `#private` is real syntax rather than a type
annotation. There is no name collision to guard against either — no public property may be spelled
with a leading `#`, so `#x` and `x` are two names in the one namespace the layout keys by.

The one place the `#` is still observable is `util.inspect`, which omits `#private` fields. So the
whole feature, below the frontend, is a two-character test in the runtime printer: skip a descriptor
field whose name starts with `#`. The names must STAY in the descriptor — slot *i* of the class is
slot *i* of the descriptor — so the printer counts visible fields first and then walks all slots
skipping hidden ones. A class whose fields are all private prints `C {}`, the same as a class with
no fields, which is right: both have nothing visible to show.

**Two deferrals, both forced by the layout rather than by privacy.** A subclass re-declaring an
ancestor's `#private` name is two distinct slots that share a spelling — the prefix rebuild is
first-claim-wins by NAME, so it would silently merge them and let the base's method write the
subclass's field. And `#brand in o` asks whether an object carries the slot at all, which is not a
question a layout where every instance of a class has every slot can answer; it becomes meaningful
with shapes. Both are `STA1214` with the reason named.

**The corpus lagged the struct, and the Makefile hid it.** `runtime/tests/print_objects.c`
hand-writes ten `JSRTClass` literals, and rung 6b's inheritance work added a fourth member
(`parent`) to that struct. Under `-Wextra -Werror` every one of them is a
`-Wmissing-field-initializers` error — but `pnpm run ci` passed anyway, because the Makefile listed
no header prerequisites anywhere. Editing `runtime/include/jsrt_value.h` rebuilt *nothing*: the
objects were stale, the archive was stale, and the corpus binaries were never relinked. The header
is the codegen↔runtime contract; a build that ignores it can only ever test the runtime the
contract used to describe. Fixed at the root with generated depfiles (`-MMD -MP` plus
`-include $(DEPS)`), which is why a change to a header cannot be silently absent again. Each
`JSRTClass` literal now names `NULL` explicitly.

## 67. Overriding is one bit per method, and the bit is a whole-file question

**The dispatch decision does not belong to the call site.** `a.m()` where `a: Animal` must reach
`Dog`'s `m` if `a` holds a `Dog`, so whether the call can be direct is not a fact about the receiver
expression, nor about `Animal`, nor about the pair — it is a fact about the FAMILY: does any chain
containing `Animal` declare `m` twice? The lowering asks exactly that, of the whole file, once per
call (`isOverridden`). A `no` keeps rung 6a's direct call unchanged, which is why a program that
overrides nothing pays nothing for the feature existing.

**The table is the field layout again.** A class descriptor gained `method_count` and a `methods`
array of file-scope `JSRTClosure` pointers, in the same prefix order the fields have: a subclass's
table begins with its base's, in the base's order. So the slot comes from the receiver's STATIC type
and the entry comes from its DYNAMIC one, and both are right for the same reason a field slot is.
`methodDeclaringClass` already walked leaf-first, which is precisely what a table entry needs: the
most derived declaration this class responds to.

**`super.m()` is the one call that must NOT be virtual.** It is a call on the same receiver with the
override skipped — dispatching it virtually would find the override again and recur forever. So it
lowers to a `MethodCall` whose target is the receiver PARAMETER (not an evaluation of `super`, which
denotes no value) and whose dispatch is `direct` regardless of what the rest of the family does.
`super.x` on a field is refused: a field has one slot per name, so `super.x` and `this.x` are the
same slot and the spelling would promise a distinction the layout cannot make.

**What the table's constness forces.** Entries are file-scope constants, so no method in an
overriding family may capture. A class at module scope has nothing to capture; a class inside a
function may, and there is no per-instantiation table to hold it. The gate refuses overriding there
by asking whether the class declaration's parent is the source file — a syntactic test for a
codegen property, justified because the property is exactly "this class's methods are constants".
Re-declaring a FIELD stays refused for an unrelated reason: a field is a slot, and two declarations
of one slot have two initializers racing for it in an order the layout does not express.

**A mode-policy bug fell out.** `noImplicitOverride` was on in both modes, so js mode demanded a
JSDoc `@override` tag on every overriding method — rejecting ordinary JavaScript for having no
annotation, which is precisely what js mode promises not to do. It is now `mode === 'ts'`, the same
shape `noImplicitAny` already has (notes #48). ts mode keeps it: there the modifier is real syntax,
and an accidental override is exactly the mistake a method table makes silent.

## 68. js mode still rejects legal JavaScript when an override narrows a return type

Found while writing the overriding fixtures, and NOT fixed here:

```js
class A { m() { return 'x'; } }
class B extends A { m() { return 1; } }   // STA0012: Type '() => number' is not assignable to '() => string'
```

Both bodies are untyped. The checker infers `() => string` and `() => number`, finds the override
incompatible with the base, and reports it — and unlike `noImplicitAny` and `noImplicitOverride`
there is no flag to turn off, because base-class compatibility is not a strictness option. js mode's
contract (docs/MODES.md) is that untyped code is never rejected, so this is a contradiction, not a
missing feature.

Recorded rather than fixed because the fix is a policy decision with a wider blast radius: js mode
would have to DOWNGRADE a class of checker errors that arise from inference over unannotated code,
and the set has to be named precisely — an error about an annotation the user wrote must still be an
error. `tests/subset/subset_override_widening_js.js` pins it as an `@expected-fail` decision test so
the day it is fixed is the day that marker comes off.

## 69. Accessors do NOT force the dynamic path — the plan said they did, and it was wrong

`docs/SUBSET.md` promised `dynamic (property access lowers to function call)` for a class with a
getter or setter, and the gate refused such a class outright with the reason "a getter or setter
turns a field READ into a call". Both halves of that were an over-reading of one true fact.

The true fact: `o.x` on an accessor is a call. What does not follow: that the CLASS becomes dynamic.
An accessor is a pair of member functions under a name no source can spell — `get x` and `set x`,
where the space does what the dot does for a static — and the property occupies no slot at all. So:

- the class's real fields keep their fixed slots, and a subclass keeps its prefix layout;
- `o.x` lowers to a `MethodCall` with no arguments, `o.x = v` to one with a single argument;
- dispatch, the method table, arity padding and the receiver parameter all apply unchanged;
- `util.inspect` never prints the property, because the printer prints SLOTS and there is none —
  which is what Node does, and it falls out rather than being arranged.

Nothing else moved. No HIR node, no verifier case, no emitter case, no runtime change: the entire
feature is a mangled name, a branch in `classTypeToHType` that pushes methods instead of a field,
and two branches in the lowering. The `dynamic` verdict in the decision tests became `static`.

**What stayed deferred, each for its own reason.** A compound assignment (`o.x += 1`) is a get and a
set of ONE property, and the machinery that evaluates a receiver exactly once across a
read-modify-write hoists a slot, which an accessor is not. A static accessor belongs to the class
object, which a plain binding is not. A `#private` or computed accessor name has no mangled form
yet. And overriding an inherited accessor is refused because the lowering decides virtual dispatch
by looking for a method DECLARED twice, which is a question about method declarations — accessors
are dispatched directly, and an override would silently reach the base's half.

**A set-only property is the case that catches a lazy implementation.** `set take(v) {}` with no
getter has no read at all, so building the read half of the place unconditionally reports a missing
`get take` on a class that is correct. The read is built only when the getter exists — and the only
forms that would consume it are the compound ones, which the gate already refused.


## 70. An object literal is a class whose declaration is a TYPE (rung 6b)

**Evidence.** `plan.md` rung 6b listed object literals as "the one remaining item that breaks a
property 6a's fixed-slot layout depends on (a literal has no class declaration to be a layout OF)".
That is true of the DECLARATION and false of the layout. The checker already computes an anonymous
object type for `{ x: 1, y: 'two' }`, with a property list in written order — which is precisely
what `classTypeToHType` consumes for a class. The missing piece was never a layout; it was a name.

**What it reduced to.** `shapeTypeToHType` turns a type with nothing but data properties into the
same `hObject` a class produces, named STRUCTURALLY: `{x: number, y: string}`. The leading brace is
what makes the name unspellable, the third instance of the trick the receiver parameter (leading
space), statics (a dot) and accessors (a space) already use. A structural name means two literals
with the same fields are the same HType, so:

- they are assignable to each other, which is what a shape TYPE means in TypeScript;
- the emitter's descriptor cache keys on the name, so one `JSRTClass` is emitted and shared;
- a different key ORDER is a different name, which is correct — order is layout.

The descriptor's C name is the empty string, and `jsrt_print` treats an empty name as "no
constructor name". That is the only runtime change the whole feature needed, and it is what makes
`{ x: 1 }` print bare where `Point { x: 1 }` prints with its class. The HIR gained one node,
`ObjectLiteral` — entries in written order, no descriptor, no keys — and the emitter one sequence
expression: allocate, `jsrt_object_set` per entry, yield the object.

**Why the verifier gained a case (STA4052).** The entries ARE the slots. Nothing downstream carries
a key, so an entry list that disagrees with its shape's field order would emit a silently wrong
object rather than fail. The check is one comparison of two name lists, and it is the only thing
standing between a reordering bug and a golden test that still passes on a symmetric fixture.

**What stayed deferred.** A shorthand, spread, method or accessor member and a non-identifier key
are Phase 3 work: each is statically knowable and simply has nothing to lower to yet. A literal
whose type is not a layout — an optional property, an index signature — is Phase 4 work, because
there is no fixed slot list to build at all; that is the shape table in Task 4.1, and the gate's
message says so rather than pointing at the same phase for both kinds of refusal.

## 71. The duplication budget is measured in LINES, and a type file breaks it (rung 6b)

**Evidence.** Adding `ObjectLiteral` and `ObjectEntry` to `src/hir/nodes.ts` took `pnpm run dupes`
from `25 clones · 0.8%` to `26 clones · 3.0%`, over the 1% threshold. The new clone was reported as
`src/hir/nodes.ts 18-641 ~ 33-668` — 623 duplicated lines in a 672-line file. Measured on that file
alone: `1 clones · 92.7% duplication`, with the same run's own token column reading
`Duplicated tokens: 50 (3.80%)`. Deleting the nine added lines returns it to `0 clones · 0.0%`.

**What that means.** The match is 50 tokens — exactly `minTokens` — and jscpd bills it by the LINE
span between the first and last matching token. In a file that is 60% doc comments, 50 sparse tokens
stretch across 623 lines. The two interfaces did not duplicate anything; they extended a structural
pattern past the detector's floor.

**Why the pattern cannot be factored out.** `nodes.ts` is the HIR's discriminated union and holds no
function, no constant and no logic at all — it is types. A union member is
`interface X extends Node { readonly kind: '…'; … }` by construction, and the `kind` field is the
discriminant every exhaustive switch in the compiler depends on. Deleting the repetition means
deleting the type safety it buys.

**The fix, and why not the other two.** A `jscpd:ignore-start`/`ignore-end` pair wraps the
declarations in `nodes.ts`. It is attached to the code it describes, it says why in the file, and it
leaves any future function in that file checked — the markers open after the import and close at
EOF, so code that is not a declaration would have to be added outside them. Raising `minTokens`
would have hidden real 50-token copies everywhere in the compiler, and adding the file to the config
`ignore` list would have exempted it invisibly, from a file that never mentions why. The threshold
itself stays at 1% and the config is unchanged: `25 clones · 0.8%`.

---

## 72. Map and Set are one implementation, and the plan asked for two (rung 7)

**What the plan said.** `docs/SUBSET.md` split the collections four ways and described the split as
two data structures: a "specialized hash table for primitives, unboxed key/value" that is *static*,
and an "identity-hash table" for object keys that is *dynamic*. Read literally, that is two probe
tables, two comparison functions and two sets of runtime entry points.

**Evidence that one suffices.** The comparison a Map performs is SameValueZero, and it is the only
comparison either collection needs. On a NaN-boxed value:

- a primitive key **is already unboxed** — the box IS the bits, so there is nothing a specialized
  table would strip;
- an object key **is already its pointer** — the box IS the identity, so there is nothing an
  identity table would compute.

The two cases differ only in the hash function, and that difference is four lines inside one
`hash_key`: a number normalizes (`-0` → `+0`, every NaN → canonical) and hashes as a double, a
string hashes FNV-1a over its UTF-16 units, and everything else hashes its box. `runtime/src/jsrt_map.c`
is 270 lines total and serves all four SUBSET rows, plus Set, which is the same struct with the
value half unused and a second `JSRTClass` descriptor to tell it apart.

**What was actually built.** One `JSRTMap`; two descriptors (`jsrt_class_map`, `jsrt_class_set`);
one `same_value_zero`; one `hash_key`. The `Object` tag carries both, because the 3-bit tag field is
fully allocated (`docs/VALUE.md` §1.1) and a builtin cannot have a tag of its own — the descriptor
pointer in the shared object prefix is what distinguishes them, the same trick object literals use.

**The plan and SUBSET.md are edited to match**, and the two "dynamic" rows keep their verdict for a
different and true reason: `Map<object, V>` is dynamic because `object` describes no layout and the
KEY TYPE is Unknown, not because the table underneath is a different one.

**Two facts the rows now state that the plan did not predict.** The type arguments must be on the
CONSTRUCTION — `const m: Map<string, number> = new Map()` types the call itself `Map<any, any>`, so
that spelling is dynamic while `new Map<string, number>()` is static. And every `.get` is dynamic:
the lib types it `V | undefined`, and the HType model has no union. `.has` and `.size` are the typed
reads today, which is the same relation `for-of` has to an array index read (plan-notes 53).

**One gate rule changed to make this reachable.** `isGlobalReference` now answers false for the
callee of a `new`. `new Map()` is one HIR node naming a constructor, never a read of the `Map`
binding, and `gateNew` already refuses every constructor it does not implement — so answering
"global" there only added a second diagnostic to the same span. The builtin is told from a user
`class Map {}` by asking whether every declaration of the symbol lives in a `.d.ts`: the builtin is
declared and never defined, a user class has a body, and a body only exists in a source file.
(`hasNoDefaultLib` looks like that test and is not — it is false for `lib.es2015.collection.d.ts`
and every other split lib file. Only `lib.es5.d.ts` carries the directive.)

**Two duplication fixes the rung forced, both real rather than jscpd artifacts.** Adding the
collection cases took `pnpm run dupes` to `34 clones · 1.1%`, over the 1% threshold. Unlike
plan-notes 71 this was not a line-span illusion: the collection call was the SIXTH copy of "lower
every argument left to right, abandon the call on the first failure" in `src/lower/index.ts`, and
`jsrt_map_clear` was the second copy of the six-field empty state in `runtime/src/jsrt_map.c`. Both
are now one definition — `lowerArguments()` and `map_reset()` — and the argument one is load-bearing
rather than tidy: argument order IS evaluation order, and a drifted copy would reorder a user's side
effects. A third, `num`/`str` written identically in three print corpora, moved to
`runtime/tests/corpus.h`; a corpus is only ground truth while its C and `.mjs` halves build the same
values, so those constructors having one definition is the point rather than a side effect.
`29 clones · 0.9%`, threshold and config untouched.

## 73. Monomorphization is not a pass, and the plan implied it was one (Task 3.4)

**Contradiction.** `plan.md` lists monomorphization under `src/passes/` alongside const-fold, DCE and
inline — i.e. as an HIR→HIR transform. Written that way it needs a clone walker that rebuilds every
HIR node with a substituted type: ~40 node kinds, each of which must be re-derived when a new node
kind lands, and each of which is a place a type parameter can survive by omission.

**Evidence.** The lowering already threads `bindings: Map<string, HType>` through every one of its
33 type-computing sites, and every one of them goes through `checker.getTypeAtLocation`. Lowering
the generic's AST a second time with the substitution installed in that map produces the specialized
HIR directly — one new function (`lowerSpecialization`), no walker, and the substitution applied at
the ONE place a `ts.Type` becomes an HType (`typeAt`). The clone-walker version would have had to
re-implement the same substitution at 40 sites to get the same result.

The stronger argument is the invariant. As a pass, "no type parameter survives" is an obligation on
the walker: it holds until someone adds a node kind and forgets a case, and the failure is silent —
a `T` compares unequal to everything, so it surfaces as an unrelated type mismatch several rules
away. At the lowering it is a property of construction: no code path builds an `HTypeParam` into a
node, because `typeAt` substitutes before the node exists. `STA4054` in the verifier is then a
check on the compiler, not a load-bearing step of the algorithm.

**Two things this cost, both worth it.** The substitution rides in `bindings` under keys no
identifier can spell (`<T>`, the same trick as `RECEIVER = ' this'` and the static's dot) rather
than as a 34th parameter or module-level state — the emitter's leaked-closure-state bug is the
standing argument against the latter. And the specialization is BOUND under `box<number>` while its
`fn.name` stays `box`, so `console.log` prints `[Function: box]`; the emitter takes the name from
`stmt.fn.name ?? stmt.name` for exactly this.

**Recovering the substitution without internals.** TypeScript computes the type arguments during
inference and exposes only the resolved signature, its mapper being private. Unifying the DECLARED
signature's HTypes against the RESOLVED signature's recovers it through the public API, and is exact
rather than heuristic because one signature IS the other instantiated. Unifying on HType rather than
`ts.Type` is what makes instantiation sharing fall out for free: the checker infers `T = 42` for
`box(42)` and `T = 7` for `box(7)` — two distinct literal types — and both map to `number`, so the
two calls share one specialization instead of emitting identical C twice.

**Plan edited** in the same change: Task 3.4 now says where specialization happens and lists what is
deferred (`STA1214`: a generic as a value, generic arrows, constraints, defaults, explicit type
arguments, generic classes). The boxed-`Unknown` fallback instantiation the plan offers for cold
generics is NOT built — §13's bloat budget has not been tripped, and a second code path with no
measurement behind it is the thing §15.4 exists to prevent.

## 74. Union types cost nothing, and a narrowing that cannot be checked must not be refused (Task 3.5)

Three decisions inside boundary-check insertion, all of which the plan left to judgment.

**Unions came free, because the model has none.** `plan.md` lists "discriminated unions" as one of
the narrowings Task 3.5 must handle, and separately lists `union<T1 | T2>` as an HType kind still to
build. The second turned out not to be a prerequisite for the first: `string | number` maps to
`Unknown` today, and a `typeof` guard over it narrows to `string` — which is exactly the shape the
`unknown` case already needed. So `tests/subset/subset_union_types_*` flipped off `@expected-fail`
with no union node written. What is still deferred is the narrowing that reads a DISCRIMINANT field
rather than asking `typeof`; that one does need the model to see the constituents.

The one union rule that had to be added is widening: a union whose constituents all map to a single
HType is that type. `"a" | "b"` is a `string`. Without it `typeof` is unusable, because TypeScript
types `typeof x` as a union of eight string literals — so `const t = typeof x` would have been
`Unknown`, and asking an unknown value what it is would have produced another unknown. This is
widening, not guessing: every constituent gives the same answer, so nothing is invented.

**A narrowing that cannot be checked is dropped, not refused.** The first implementation refused at
the gate any narrowing to a type a tag cannot settle — an object, an array, a signature — on the
reading that the accept set must equal the HIR's vocabulary. It broke ten golden fixtures
immediately: `m.get(k) ?? d` narrows an `Unknown` to `Map<K, V>`, and `x ?? y` narrows one to
`null`, and both had been compiling correctly for rungs. The refusal was buying nothing. Leaving the
value `Unknown` is already sound — nothing downstream trusts a type the HIR does not claim — so the
cast or narrowing lowers to its operand alone and the value stays on the dynamic path it would have
taken anyway. The invariant is intact either way: an `Identifier` typed `Unknown` is a node the HIR
has, so the gate accepted nothing the lowering cannot build.

**The check is per USE, not per binding.** `if (typeof x === "number") { return x + x + x; }` emits
three checks, not one. Hoisting to one would mean asserting that the value did not change between
the reads, which is the kind of unproven reasoning golden rule 4 exists to forbid — and coalescing
them is a job for an optimization pass that can see the assignments, which §13's tripwire already
names as the response if checks dominate a profile.

**Also here:** `jsrt_panic` gained `_Noreturn`. A failed check has no value to return, and without
the declaration every caller needs an unreachable `return` that reads as a path the code can take.

---

## 75. Passes run before the verifier, and inlining is defined by four refusals (Tasks 3.6–3.9)

**Evidence:** `src/passes/{rewrite,constfold,dce,inline,index}.ts`, `tests/unit/passes.test.ts`
(25 tests), `tests/golden/{ts/optimization.ts,js/optimization.js}`, `src/cli/build.ts:118`.

**`optimize` runs BEFORE `verifyHir`, not after the lowering.** The obvious placement is the other
way round — verify the lowering's output, then optimize — and it is wrong for the reason the
verifier exists. The verifier is the only thing between a bug and silently wrong generated C, and
what reaches the emitter is the OPTIMIZED module. Checking the lowering's output instead would
verify a tree nothing emits and leave the one that does unchecked, so a pass that produced ill-typed
HIR would be a clang error against generated code rather than an `STA4xxx`. `build.ts` therefore
lowers, optimizes, verifies, emits, in that order.

**The rewriter needed a list-level hook.** `Rewriter.statement` returns a list, which says "replace"
and "delete" — but not the most ordinary statement-level fact there is: a `return` makes its
FOLLOWING SIBLINGS unreachable. A statement hook can only ever speak for itself. `Rewriter.statements`
sees a whole sequence, and DCE's unreachable-code elimination is written against it. One exception,
which is a language fact rather than a convenience: a `function` declaration after a `return`
SURVIVES, because it is hoisted and holds its binding for the code above.

**Inlining is four refusals, not an analysis.** The HIR has no block-expression, so a general
inliner needs temporaries, a result binding, and every `return` rewritten to an assignment plus a
jump. That machinery wants a measurement and §13's tripwire has not fired. What is built is the case
needing none of it — a body that is exactly one `return <expr>` — bounded by four conditions, each
closing one way substitution changes meaning: (1) one statement; (2) the body names nothing but its
own parameters; (3) every argument is a literal or identifier; (4) types agree exactly, argument to
parameter and result to call.

Condition 2 does the most work and is worth stating separately, because it closes a hazard that has
nothing to do with closures. A body reading a module-level `g`, moved into a caller that has its own
local `g`, silently starts reading the caller's — and the HIR resolves identifiers by NAME, so there
is no scope information available here that could tell the two apart. Declining to move any free
name at all also makes recursion impossible by construction: a recursive body must name itself.
Nothing in `inline.ts` tests for recursion. The same name-only resolution is why a candidate whose
name is bound more than once anywhere in the module is dropped outright: a local `f` shadowing the
module-level `function f` would otherwise be inlined at a call site that never meant it.

Condition 4 is `Unknown` preservation, and it is what makes js mode the interesting half of the
golden pair. `double(21)` in `tests/golden/js/optimization.js` has a `number` argument and an
`Unknown` parameter, so it does NOT inline — substituting would replace an unknown-typed subtree
with a typed one and cancel exactly the boundary check unknown-ness exists to require. Both fixtures
print identically, because Node inlines nothing anywhere.

**The pipeline runs once, not to a fixpoint.** Order is a chain: inlining exposes constants
(`double(2)` becomes `2 * 2`), folding decides branches (`if (1 < 2)` is not a literal condition
until `1 < 2` is `true`), and eliminating branches is what finally makes a function unreachable —
which is why the shake runs last. A second round would find a little more. Iterating until nothing
changes costs compile time and risks a pass pair that oscillates, and that trade wants a measurement
there is none of yet.

**What DCE deliberately does not recognize.** An `if` whose branches both `return` also terminates,
and is not treated as a terminator. That is the first step onto a lattice — then `switch` with a
`default`, then a loop with no `break` — and each step buys a rarer program while widening what a
bug here could delete. Unreachable code in a real source file sits immediately after a jump. For the
same reason the shake covers functions but not classes: `new C()` names its class by string rather
than by an identifier the reference walk would see, and a shake that cannot see a reference is a
shake that deletes live code.

---

## 76. Exception nodes stay gated until their emitter lands (2026-08-30)

**Evidence:** `src/hir/nodes.ts` adds `ThrowStatement` and `TryStatement`, and `src/lower/index.ts`
can build them, but `src/codegen/index.ts` has no landing-pad implementation. Before this review,
`src/frontend/gate.ts` accepted both constructs; a valid `try { throw 'boom' } catch {}` therefore
escaped the frontend and crashed the emitter with `Unknown statement kind: try-statement`, while
`pnpm run typecheck` failed its exhaustive switches at `src/codegen/index.ts:626` and `:1034`.

Until Task 3.10 is implemented, the gate reports the existing generic boundary code `STA1214` for
`throw`, `try`, and `catch`, and the emitter has explicit internal guards for hand-built HIR. This
keeps user-facing failures diagnostic-only and restores the gate/HIR/emitter invariant without
claiming exception unwinding is complete.

## 77. Exceptions: statements-with-pending-checks forced the comma builders to learn to flush (Task 3.10)

**Evidence.** Task 3.10 as written ("lowering emits per-scope cleanup blocks") reads as if try/catch were the only construct touched. Implementing it touched every call site the emitter produces, for a reason worth recording: a pending-check must sit BETWEEN a call and whatever consumes its result, and the emitter expressed calls as comma expressions *inside* their consumer (`x = (s0 = f, s1 = a, jsrt_call(...))`). There is no place in a comma expression to put `if (jsrt_pending()) goto pad;`.

**Decision.** Calls (plain, method, `new`-with-ctor, `super`) are now emitted as their own statements, result parked in the (rooted) callee/receiver slot, check appended, slot name returned to the consumer. That in turn exposed an evaluation-order hazard in every multi-operand comma builder: with a call in operand N, operands 0..N-1 must already be IN their slots when the call's statements run, or `x + f()` reads `x` after `f` mutates it. The shared `sequencePart` helper does exactly that — call-free operands keep the compact single-line comma shape (golden-C stability, and most expressions), an operand with a prelude flushes the sequence so far as a statement first. Conditional contexts can't even flush: a loop condition re-runs per iteration and a `&&`/`||`/`??` right operand runs only sometimes, so those capture the prelude into a buffer and replay it at the evaluation point (loops restructure to `while (1) { <prelude>; if (!truthy) goto brk; … }` only when the prelude is nonempty).

Also settled here: the finally protocol is a per-try `int` completion code dispatched AFTER the finally body (0 normal, 1 rethrow, 2+ per distinct routed jump), with the dispatch re-invoking the routing logic in the popped context so nested finallys chain; the pending cell overwrites on throw BY CONTRACT (a finally's throw replaces the completion — jsrt_throw.c documents it as required, not tolerated); and a catch whose try body cannot throw is not emitted at all, because its landing pad would be a label nothing jumps to guarding dead code. `STA4057` allocated (verifier: try with neither catch nor finally / binding without catch block); docs/DIAGNOSTICS.md band bookkeeping updated (STA4040–STA4057 taken).

**Plan edit.** Task 3.10 marked ✅ Done with CI figures in the same change.

## 78. Modules: whole-program merge resolves imports by name, so the gate refuses every rename (Task 3.11, 2026-08-30)

**Evidence.** Task 3.11 asks for ESM whole-program v0: import graph from the `ts.Program`, cycles = STA3001 with locations, module-init in topological order. The minimal artifact honoring that is ONE merged Module HIR — each file's statements in topological order (dependencies first, entry last), sharing one binding namespace threaded through `lowerProgram`. In that shape an import binds nothing: `import { x } from './b.ts'` makes the importer's `x` resolve to b's own top-level binding *by name*. Three consequences, each enforced rather than hoped:

1. **Every aliasing shape is refused** (not-yet STA1214, Phase 4): renamed import/export specifiers (`x as y`), default imports, namespace imports, re-exports, non-literal default exports. Name-based resolution cannot honor a rename; accepting one would silently bind the wrong value. `import type` renames stay accepted — erased, nothing to resolve. `export default <literal>` is accepted and lowers to nothing: without default imports, nothing can observe it.
2. **Cross-file top-level name collisions are refused** (not-yet STA1214): two files declaring the same top-level name — exported or not; scopes TypeScript keeps apart — collide in the merge, and the later initializer would silently overwrite the earlier binding. `src/frontend/graph.ts` names both files in the diagnostic.
3. **Cycles are STA3001** with the path spelled (`a.ts → b.ts → a.ts`), found as DFS back edges. ESM gives cycles well-defined semantics only via live bindings + TDZ checks, neither expressible in a merged namespace.

**compilerOptions change** (`src/frontend/program.ts`): `module: NodeNext, moduleResolution: NodeNext` → `module: ESNext, moduleResolution: Bundler, moduleDetection: Force`. NodeNext classifies files by the nearest package.json `type` field and calls a bare directory of `.ts` files CommonJS, which rejects `import` outright under `verbatimModuleSyntax` (observed as STA0012 on the first multi-file smoke). Stator compiles ESM regardless of packaging metadata (plan §1), so Force makes every file a module and Bundler resolves relative specifiers without consulting package.json. Bundler is laxer than Node in one way that matters: it resolves extensionless relative specifiers. The gate re-imposes Node's own permanent ESM rule as **STA1113 (never)**: a relative specifier names its file extension. Bare (package) specifiers are not-yet STA1214 (Phase 7). `Span` gained an optional `file` so `#line` directives name the right file inside the merged program.

## 79. Tree-shaking builtins is the linker's job today, because no builtin is an HIR module yet (Task 3.12, 2026-08-30)

**Evidence.** Task 3.12 says "Builtins are HIR-level library modules; only referenced ones are emitted/linked." The first clause describes a representation that does not exist: every builtin (`console.log`, string/array/Map operations, the numeric protocol) is a C function in `libjsrt.a`, dispatched by the emitter as a `jsrt_*` call — nothing is authored at HIR level, so there is nothing HIR-level to shake, and the emitter already emits only the user's own code. What DID need fixing was the link: a static archive resolves at .o granularity, so hello-world linked 53 `jsrt_*` functions (all of `jsrt_map.o`, dragged in transitively) for the 5 it references.

**Change.** Function-granularity dead-stripping: `runtime/Makefile` adds `-ffunction-sections -fdata-sections` to `CFLAGS_COMMON` (required for ELF `--gc-sections` to have anything to drop; free on Mach-O, where per-symbol subsections are the default), and `linkExecutable` passes `-Wl,-dead_strip` on darwin / `-ffunction-sections -fdata-sections -Wl,--gc-sections` elsewhere. Sanitized builds skip it: ASan registers globals through arrays the linker sees as unreferenced, the documented `--gc-sections` failure mode. Measured: hello-world 72 KB → 51.8 KB, 53 → 5 `jsrt_*` symbols; the < 500 KB size target is met with ~10× headroom, so competitor-release measurement stays deferred until "once stable" arrives and a comparison would mean something. `tests/bench/baseline.json` refreshed with post-strip `binaryBytes`.

**Plan edit.** Task 3.12 marked done with the note that HIR-level builtin modules return when a builtin is actually authored at HIR level (Phase 4+ library work); the shaking mechanism is in place either way and the check (unit test asserting `jsrt_map_new` absent from a hello-world binary, `jsrt_print` present) holds it.

## 80. Dynamic objects: the contextual type decides, and the aliasing hazard is a runtime not-yet (Task 4.1, 2026-08-30)

The plan says "shape table + per-site inline caches only for the dynamic residue" but not which
literals ARE the residue. Evidence forced two decisions:

- **The decisive type is `checker.getContextualType(literal) ?? getTypeAtLocation(literal)`.** In
  `const o: { x?: number } = { x: 1 }` the literal's own type is `{ x: number }` — a perfectly good
  layout — but the binding's type is the annotation, and every later read of `o` types against
  THAT. Building the fixed object would make each such read a dynamic site aimed at a fixed
  receiver, i.e. a guaranteed runtime abort in a program that is plainly meant to work. The
  annotation wins, so gate and lowering both ask the contextual type FIRST and in the same order —
  the two must never disagree, or the gate accepts a literal the lowering cannot build.
- **Structural aliasing is a loud runtime not-yet, `STA2004`, never a silent answer.** The checker
  blesses `const a = { x: 1 }; const b: { x?: number } = a`, so a FIXED-shape `JSRTObject` can
  arrive at a shape-table site. No compile-time rule can catch this without refusing assignability
  the language guarantees; answering the read would mean guessing a slot; so `as_dynobj` splits
  receivers three ways — dynamic (proceed), fixed object (`STA2004`, lifts in Phase 5 when the
  entry points learn to read through a `JSRTClass` descriptor), anything else (`STA4058`, a
  compiler bug, since no emitted site can produce it). Precedent: STA2002 sparse arrays.

Also settled here: the IC protocol (fill on hit only; get-misses never cached — caching absence
would serve `undefined` after a later write with the same stale shape; construction stores carry
`NULL` ICs because a fresh key on a fresh object transitions every time), and `STA4059` verifier
discipline — the three dyn nodes type Unknown by definition, so a concrete type on one is a
narrowing nothing proved. In js mode the shape can come from JSDoc `@type`, which the checker
honors in `.js` files with no new machinery.

## 81. Math builtins: only the exactly-specified operations can land before fdlibm (Task 4.2, 2026-08-30)

The plan's Task 4.2 says "`Math` … a builtin counts as implemented when ≥1 golden test exercises
it and matches Node." For most of Math those two sentences CONFLICT: golden tests diff against
Node byte-for-byte, Node's `sin`/`log`/`exp`/`cbrt`/`hypot` come from V8's vendored fdlibm, and
ECMA-262 §21.3.2 explicitly permits implementation-approximated answers — so the host libm is
allowed to differ from Node in the last ulp, and a golden test for `Math.sin` would be green on
one machine and red on another. Decision: land the EXACTLY-specified surface now (`abs` `ceil`
`floor` `round` `sign` `sqrt` `trunc` `pow` `min` `max` — IEEE-defined or spec-exact, plus all
constants and the `NaN`/`Infinity` globals), defer every approximated operation with the gate's
not-yet until fdlibm itself is vendored (`runtime/vendor/`, like Ryū — golden rule 5's "don't
write a float printer" logic applies to transcendentals too). `Math.random` is deferred with them
for the adjacent reason: no byte-for-byte golden test can exercise it.

The wrappers in `runtime/src/jsrt_math.c` exist for named ECMA/libm disagreements, each cited in
the file: C `round` ties away from zero (ECMA: toward +∞) and `floor(x + 0.5)` breaks at
0.49999999999999994; `fmin`/`fmax` skip a NaN operand (ECMA propagates) and treat the zeros as
equal (ECMA orders -0 below +0); C `pow(±1, ±Inf)` and `pow(1, NaN)` answer 1 (ECMA: NaN).

Two shapes settled here follow existing precedent rather than adding machinery: `MathCall` is a
CollectionOp-style closed-set node (exact arity after the lowering folds variadic `min`/`max`
left into binary nodes — the spec's own comparison order — and zero-argument forms into identity
literals), and `Math.PI`-style constants plus `NaN`/`Infinity` fold to number literals, which
`cDoubleLiteral` already spells (the compiler runs on the pinned Node, so the doubles are
bit-for-bit the ones golden tests expect). `STA4080` opens the verifier's third band; the second
filled at STA4059.

## 82. String builtins: one op table, undefined-padding, and two loud runtime not-yets (Task 4.2, 2026-08-30)

**Decision.** The String slice lands as one `StringOp` HIR node whose vocabulary is a TABLE —
`STRING_OPS` in `src/hir/nodes.ts`, op → {arity, result} — read by the gate (accept set), the
lowering (padding + result type), the verifier (`STA4081`), and the emitter (C names derived
mechanically, camelCase → `jsrt_string_snake_case`). Adding an op is one table row plus one C
function; no consumer can drift from another because there is nothing to keep in sync.

**Padding.** The lowering pads omitted optional arguments with `undefined` literals up to the
table's arity, so every `jsrt_string_*` function has one fixed C signature. Sound because ECMA-262
specifies "if _arg_ is undefined" — explicit `undefined` and absent are indistinguishable — for
every op in the landed set. (Not true of e.g. `Array.prototype.fill`'s end argument semantics
elsewhere; the claim was checked per-op, not assumed.)

**GetSubstitution is implemented, not refused.** Node honors `$$` `$&` `` $` `` `$'` in
plain-string `replace`/`replaceAll` patterns, so refusing them would fail byte-for-byte goldens on
ordinary code; `$n`/`$<name>` stay literal without a RegExp match, exactly per spec.

**Two runtime not-yets under `STA2005`** (fourth runtime-emitted diagnostic, precedent STA2002):
`repeat` with a negative/infinite count — the spec throws RangeError, and builtins cannot join the
throw protocol until exceptions carry across the C boundary — and case mapping above ASCII, which
waits on `libunicode` (vendored with Task 4.3's libregexp). Both abort loudly rather than answer
wrongly, per prime directive 4.

**Dashboard fix.** The coverage renderer's mention-check looked for `String.prototype.trim`
literally, which no source ever spells; prototype namespaces now match call syntax (`.trim(` — the
paren keeps it from matching inside `.trimStart(`). The renderer caught its own gap by flagging 8
correct claims as stale, which is the failure mode it exists to surface.

## 83. Array builtins: the non-callback surface, and lastIndexOf breaks the padding rule (Task 4.2, 2026-08-30)

**Decision.** The Array slice reuses the String slice's whole shape — `ARRAY_OPS` table in
`src/hir/nodes.ts` read by gate/lowering/verifier (`STA4082`)/emitter — and lands only the
methods that take no function argument. The callback-taking majority (`map`, `filter`,
`forEach`, `reduce`, `sort`, …) needs the runtime to call back into compiled code, a protocol
that does not exist; deferring them by name at the gate is honest, and lowering them to inline
loops instead was rejected because an expression-position loop needs block-expression machinery
the HIR does not have.

**lastIndexOf is the padding rule's counterexample.** For every other landed op ECMA-262 gives an
explicitly-passed `undefined` the meaning of an absent argument, which is what makes the
lowering's undefined-padding sound. Array `lastIndexOf` is different: absent `fromIndex` means
`length - 1`, explicit `undefined` means `ToIntegerOrInfinity(undefined)` = `0` — Node answers
`[1,2,1].lastIndexOf(1)` = 2 but `[1,2,1].lastIndexOf(1, undefined)` = 0. It therefore lands
with arity 1 and an explicit position stays deferred, rather than padding a wrong answer in.

**Result-kind additions.** `self` types the result as the RECEIVER's array type
(`slice`/`concat`/`fill`/`reverse` — the last two mutate in place and return the receiver, per
spec) and `element` is Unknown by the IndexAccess precedent: `pop` on an empty array really
answers `undefined`.

**Two spec asymmetries golden-tested.** `includes` uses SameValueZero, so `[NaN].includes(NaN)`
is `true` while `[NaN].indexOf(NaN)` is `-1`; and `-0` matches `0` under both. `join` is also
`Array#toString` — `jsrt_to_string`'s array branch now delegates to `jsrt_array_join`, and
`null`/`undefined` elements join as empty text.

**Shared helpers moved, not duplicated.** `int_or_inf`/`clamp_index`/`relative_index` left
`jsrt_string_ops.c` for `runtime/src/jsrt_index_util.h` (internal header, static inline) so the
two builtin families share one definition of the spec's index steps — and the 1% duplication
gate stays honest.

## 84. console beyond log: a stream flag, not new nodes — and the golden runner grows a stream (Task 4.2, 2026-08-30)

**Decision.** `console.info/debug/warn/error` lower to the SAME `ConsoleLogCall` node as `log`,
plus one field: `stderr: boolean`. Node's five inspect-style methods differ only in destination
(`warn`/`error` → stderr; `info`/`debug` are stdout aliases), formatting is identical, and
nothing downstream ever needs the method name — so the name dies at lowering and the emitter
picks `jsrt_print` or `jsrt_eprint` (the same `print_to` body, parameterized by stream).

**The latent bug this fixed.** The lowering had accepted `warn`/`error` since Phase 2 and mapped
them to stdout — unreachable only because the gate refused them. Landing the gate acceptance
without the stream split would have turned that into a silent wrong answer against Node.

**The golden runner now compares BOTH streams byte-for-byte.** Comparing stdout alone would let
a wrong-stream bug pass invisibly; the stderr comparison is a strengthening of the golden
contract, never a loosening. The compiler's ambient `Console` interface (stator.globals.d.ts)
grew the four methods with the same parameter type `log` promises, which is what `jsrt_print`'s
inspect corpus already holds.

## 85. Object enumeration: one walk, two layouts, and entries is honestly dynamic (Task 4.2, 2026-08-30)

**Decision.** `Object.keys/values/entries` land as a namespace-call node (`ObjectStaticCall`,
MathCall's shape, one rooted slot) over ONE runtime walk (`collect` in `jsrt_object_ops.c`)
parameterized by what each index becomes. A fixed shape enumerates its class descriptor's
`fields` (declaration order); a dynamic shape enumerates its shape chain, filled into offset
order in one pass (insertion order). Both are the ECMA-262 enumeration order for these objects,
because every key either layout can hold is an identifier — the integer-like-keys-first reorder
cannot trigger. The comment in the C file states this as the invariant it is.

**Arguments outside the two layouts are deferred, not approximated.** `Object.keys([1, 2])` is
`['0', '1']` in Node and `Object.keys("ab")` is `['0', '1']` too — neither is an object walk,
and each would need its own arm. The gate refuses them by type (fixed `object` HType or
`isDynamicShape`), with `Object.assign`/`freeze`/`create`/… deferred by name.

**entries makes the verdict dynamic, and that is correct.** `entries` produces `[string, T]`
pairs; the HType model has no tuple, so the element is `hUnknown` and the per-file Unknown walk
reports `dynamic` for a file that uses it. The subset fixtures split accordingly
(`subset_object_static_*` static for keys/values, `subset_object_entries_*` dynamic) — the
verdict is the model telling the truth about what it can type, not a bug to paper over.

**STA4084 follows STA4058's precedent**: raised by the runtime, numbered in the verifier's band,
because it polices the same argument contract from the other side.

## 86. JSON.stringify: the type pin decides the gate, and parse waits for an untyped-result story (Task 4.2, 2026-08-30)

**Observation.** `JSON.stringify` has one honest type only in its single-argument form over serializable values: `string`. The spec's exceptions are exactly the values for which it answers `undefined` instead — a top-level `undefined` or function. And `JSON.parse` is typed `any` by TypeScript's own lib, which ts mode rejects (STA1003) before any gate rule can speak.

**Decision.** Land `stringify` arity-1 as a `JsonStringify` node pinned `string` (verifier `STA4085`), with the pin driving the gate: argument types that admit `undefined` or a function at the TOP level are refused (`STA1214`), because there the runtime would have to answer `undefined` where the node's type promises a string. Inside structures no refusal is needed — the spec itself serializes them (skip as object value, `null` as array element) and the walk implements that. Cycles and an Unknown-smuggled top-level `undefined` abort on the STA2005 pattern: the spec throws `TypeError`, which builtins cannot raise until exceptions reach the runtime boundary. Output details held to Node byte-for-byte: `-0` is `"0"` (JSON, unlike console.log), NaN/Infinity are `null`, lone surrogates escape as `\udXXX` (well-formed JSON.stringify), Map/Set serialize as `{}`.

**Deferred with evidence.** The replacer/space forms change the entire output shape (indentation, filtering) — deferred by arity. `parse` is deferred by name: its result is genuinely untyped, and the honest lowering (dyn values typed Unknown, verdict `dynamic`) is the same story dyn-field reads use — worth landing as its own slice, not as a rider. The ts-mode fixture pins today's truth: `parse` dies as STA1003 (`any` in ts mode) before the gate's not-yet, and will flip to not-yet and then dynamic as the typing story lands.

## 87. The callback protocol already existed: jsrt_call is the whole story (Task 4.2, 2026-08-30)

**Observation.** The Array slice deferred every callback-taking method "pending a runtime→compiled-code call protocol". Examining the closure ABI showed the protocol already shipped with rung 4b: every compiled function is a `JSRTClosure` whose `fn` takes `(argc, argv, env)`, and `jsrt_call` dispatches through it without knowing what kind of caller it has. A runtime builtin calling a callback is indistinguishable from compiled code calling a function value.

**Decision.** `forEach map filter some every find findIndex` land as ordinary `ARRAY_OPS` entries — same table, same STA4082 verifier case, same mechanical C-name derivation (`findIndex` → `jsrt_array_find_index`). Each runtime loop passes the spec's `(element, index, array)` triple (a callee declared with fewer parameters reads the rest as `undefined` through `jsrt_arg`), caches `length` at entry (the spec's ToLength step) while re-checking existence per visit (shrink-then-regrow is visited exactly as Node visits it), and coerces predicate answers with `jsrt_truthy` — ToBoolean, so a predicate returning a number works. Two new result kinds: `mapped` keeps the CHECKER's result type — `map` because its element is the callback's to choose, `filter` because a type-guard predicate legitimately narrows below the receiver's element, and pinning either to the receiver would make the verifier reject well-typed programs; `undefined` is `forEach`. The gate requires the single argument to have ≥1 call signature (an `any`-typed callback in js mode is deferred, not passed to `jsrt_call` to die as a non-closure) and defers the thisArg form of all seven.

**Deferred with evidence.** `reduce`: the absent-vs-present initial value changes both the argument protocol (first call gets `(acc, x, i, arr)` vs `(x0, x1, 1, arr)`) and the result typing — its own slice. `sort`: the DEFAULT comparator sorts by ToString (`[10, 9]` → `[10, 9]`), so landing comparator-only would invite exactly the silent divergence golden tests exist to catch; it lands with a stable-sort implementation decision. Smoke test (closures capturing locals, named function callbacks, the `(w, i, all)` triple, empty arrays, nested arrays): BYTE-IDENTICAL vs Node on first run, including Node's array-grid inspect formatting.

## 88. reduce lands with-initial only, and its result kind pins nothing (Task 4.2, 2026-08-30)

**Observation.** `reduce`'s two forms differ in more than arity: without an initial value the FIRST element becomes the seed and iteration starts at 1, and `xs.reduce(cb, undefined)` seeds with `undefined` rather than the first element — so the undefined-padding rule that folds every other optional argument would silently change the answer, the same trap `lastIndexOf` documented (plan-notes 83).

**Decision.** `reduce`/`reduceRight` land as exact-arity-2 `ARRAY_OPS` entries; the gate defers the 1-argument form by count ("without an initial value is not yet supported"). Their result kind is new: `checker` — the checker's answer, with NOTHING pinned by the verifier, because the accumulator type is whatever the callback and initial value agreed on (number, string, an array being built — the smoke test does all three) and any pin would be the compiler asserting a shape the spec does not have. The runtime loops prepend the accumulator to the callback triple: `(acc, element, index, array)`; `reduceRight` walks down from the ENTRY length with a per-visit existence check, the spec's HasProperty step over a dense representation. Smoke: BYTE-IDENTICAL vs Node first run.

## 89. sort: stability forces the algorithm, and the scratch must be GC-visible (Task 4.2, 2026-08-30)

**Observation.** ECMA-262 §23.1.3.30 makes sort stability normative (since ES2019), which rules out `qsort`. And unlike `reduce`, sort's two forms CAN share a padded signature: SortCompare treats an explicit `undefined` comparator exactly as an absent one, so the standard undefined-padding rule is sound here.

**Decision.** `jsrt_array_sort` is a top-down stable merge over the receiver's own storage. Two details are load-bearing: the merge takes the LEFT run on ties (`<= 0`), which is the entire stability argument; and the scratch buffer is a real jsrt array (`jsrt_array_new` copy), not raw malloc — during a merge an element's only reference is its scratch copy, and the future collector must be able to see it there (the plain-malloc-scratch rule from the Object slice, applied in the other direction). SortCompare's undefined-element rule runs BEFORE the comparator (undefined sinks to the end, comparator never sees one), the comparator's answer is coerced by ToNumber with NaN meaning 0, and the default comparator is ToString + code-unit comparison — `[10, 9, 2, 100, 1].sort()` answers `[1, 10, 100, 2, 9]`, golden-tested. Smoke (default order, stability over equal keys, -0, NaN comparator): BYTE-IDENTICAL vs Node first run.

## 90. The structural quartet: three pad safely, splice does not (Task 4.2, 2026-08-30)

**Observation.** Checking each optional argument against the padding rule (does explicit `undefined` mean what absence means?): `flat`'s depth — yes (`undefined` → default 1, §23.1.3.13); `copyWithin`'s `start` (→ 0) and `end` (→ length) — yes; `splice`'s `deleteCount` — NO: `splice(start)` deletes to the END, `splice(start, undefined)` deletes nothing. The lastIndexOf trap, third occurrence.

**Decision.** `flat` (arity 1, result `mapped` — the checker computes the flattened element type, and a non-literal depth degrades honestly to Unknown), `flatMap` (callback set, result `mapped`, spreads an array answer exactly one level and appends anything else — implemented as depth-0 `flatten_into` of each answer, no intermediate array), `copyWithin` (arity 3, `self`, one memmove over the clamped overlap) land as ordinary padded table entries. `splice` lands at exact arity 2 with a gate count check; the removed run comes back as a fresh array of the receiver's element type (`self`), vacated tail slots cleared to `undefined` for the conservative-scan rule. Insertion `splice` is variadic and waits with variadic `push`. Smoke (negative indices, over-long deleteCount, overlapping copyWithin ranges, filtering flatMap): BYTE-IDENTICAL vs Node first run.

## 91. `'toString' in ARRAY_OPS` was true before toString landed: hasOwn everywhere (Task 4.2, 2026-08-30)

**Observation.** Landing `toString` surfaced a latent gate bug: every table-membership test spelled `op in TABLE`, and JavaScript's `in` walks the prototype chain — so `'toString'`, `'valueOf'`, `'constructor'`, `'hasOwnProperty'` all tested true against EVERY op table since the String slice. `s.valueOf()` would have been accepted, looked up `STRING_OPS.valueOf` (Object.prototype's function, no `arity`), padded against `undefined`, and emitted a call to a C symbol that does not exist — a link error instead of a diagnostic.

**Decision.** Every membership test against an object table (`STRING_OPS`, `ARRAY_OPS`, `CALLBACK_ARRAY_OPS`) is now `Object.hasOwn`; the `Set`-based tables (`MATH_METHODS`, `OBJECT_STATIC_METHODS`, `CONSOLE_METHODS`) were never exposed. A regression test pins `s.valueOf()` to STA1214. The slice itself: `findLast`/`findLastIndex` (downward mirrors, same entry-length + existence discipline), `toReversed`/`toSorted`/`toSpliced` (fresh copy + the mutating op's machinery, `toSpliced` inheriting splice's exact-arity rule), `toString` (= `join` undefined-separator, §23.1.3.36), `with` (copy + replace; out-of-range aborts loudly — spec throws RangeError, builtins cannot). `Array.prototype`: 34/37; the residue is `keys`/`values`/`entries`, which are iterator-protocol work, not builtin work.


## 92. JSON.parse: the annotation is the whole ts-mode story (Task 4.2, 2026-08-30)

**Observation.** `plan-notes` 86 deferred `parse` by name because its result is genuinely untyped, and the deferral note assumed ts mode would have to reject it outright: the lib types the result `any`, and any-in-ts-mode is STA1003 by design. Reading `isImplicitAny` (`src/frontend/types.ts`) showed the assumption was wrong. STA1003 fires only at an ANNOTATION SITE — `annotationSiteOf` returns the node's type annotation for a VariableDeclaration, Parameter, PropertyDeclaration, FunctionDeclaration, ArrowFunction, FunctionExpression, and `null` for every other node — that lacks an annotation AND whose checker type carries `ts.TypeFlags.Any`. So `const v = JSON.parse(t)` is an error and `const v: unknown = JSON.parse(t)` is not, and the difference is exactly the difference the language already draws: writing `unknown` is the program admitting it has data, not a type.

A second question the slice had to answer: what the gate does with an argument it cannot prove is a string. Refusing everything but a `string`-typed argument would make js-mode `parse` nearly useless — the js-mode norm is an untyped `text` parameter, and `any` is not `StringLike`. Accepting everything would read a non-string as text, which is silently wrong for exactly the values that matter. The evidence that settles it: TypeScript's own lib signature (`parse(text: string, ...)`) already rejects a KNOWN non-string in both modes at the STA0012 stage, so a compile-time refusal there buys nothing a type error was not already buying. What is left is the untyped case, which is a tag question, not a type question.

**Decision.** `JsonParse` lowers typed `hUnknown(false)` and the verifier pins nothing (contrast `JsonStringify`, pinned `string` under STA4085): the checker has no claim to check, and a later pass that proves something concrete about a parsed value must be free to say so. The gate accepts a string-ish OR an untyped argument and defers a known non-string (a rule `explain` reports even where a build reports the lib's type error first); the runtime performs the tag check and aborts on the STA2005 pattern. In ts mode the annotated spelling is THE spelling, and `subset_json_parse_ts.ts` stays an STA1003 error to record that the unannotated one still dies at the declaration — the two fixtures together are the documentation. No new diagnostic code: every loud abort reuses the STA2005 pattern, and no compile-time condition here is new.


## 93. The Object namespace is not uniformly unary (Task 4.2, 2026-08-30)

**Observation.** `ObjectStaticCall` was built for `keys`/`values`/`entries`, three methods that take one object, and it carried a single `arg`. `Object.hasOwn(o, k)` does not fit that shape, and `Object.fromEntries(pairs)` fits it only by coincidence — its argument is an ARRAY, the opposite of what the other four accept. Two ways to absorb them: add an optional second field to the node, or give it an argument list with arity fixed per method. The codebase already answers this: `MathCall` carries `args` with a per-method arity table (`MATH_ARITY`), and the collection ops carry a table of shapes with result kinds. An optional field would be a third idiom for a question two already answer.

A second observation fell out of writing the emit: with an argument LIST, `object-static` and `math-call` became the same emit — N arguments into N slots, one C call, no receiver — differing only in the function's name and in math's shortcut for a lone argument, which nests directly because a number is an immediate with nothing to keep rooted. An object argument has to stay rooted, so `object-static` always uses its slots.

A third: both `JSON.parse` and `Object.fromEntries` need a JS string to become a shape key, and `jsrt_json.c` had written that conversion inline — an immortal UTF-8 copy, because the shape table keeps key pointers forever and a collected allocation would be wrong for exactly that reason.

**Decision.** `ObjectStaticCall.args` is a list; the gate's `OBJECT_STATICS` table fixes arity, the receiver kind (`shaped` for a walk, `pairs` for `fromEntries`) and whether a string key follows, and the verifier restates arity and result kinds in `OBJECT_STATIC_SHAPES` — the verifier trusts no earlier stage. The `object-static` emit merged into `math-call`'s case, and the mechanical camelCase-to-snake_case naming became one module-level `snakeCase` used by both it and the array/string ops. `jsrt_shape_key` moved to `jsrt_shape.c`, next to the table whose lifetime rule it implements, and `JSON.parse`'s key path collapsed to a call to it. The deferred residue of the namespace is now documented BY REASON in the gate table's own comment rather than as a backlog: `assign` mutates a target a fixed shape cannot accept, `freeze`/`isFrozen` need a frozen bit every write site would consult, and the prototype four are machinery ts mode bans by design.


## 94. console is a namespace of arities, not of receivers (Task 4.2, 2026-08-30)

**Observation.** `ConsoleLogCall` carried a `stderr` boolean, which was exactly right while the five accepted members differed in nothing else: `log`/`info`/`debug` onto stdout, `warn`/`error` onto stderr, one argument each, one formatting rule. The six members this slice adds break that symmetry in the one dimension the node did not model. `groupEnd()` takes nothing. `count(label?)` and `countReset(label?)` take an optional string. `group(label?)` takes an optional value of the print type. `assert(condition, message?)` takes two with an optional tail. `dir(value)` takes one but is NOT `log` — it keeps a top-level string's quotes. A boolean cannot carry any of that, and neither can a second boolean.

The codebase had already answered the general form of this question twice. `STRING_OPS` and `ARRAY_OPS` are tables of `{arity, optional, result}` that the gate, the lowering, the verifier and the emitter all read, so that an arity is stated once and cannot drift between the stage that admits a call and the stage that emits it. The difference here is only that console's members vary by ARITY where the collection ops vary by RECEIVER; the table shape is the same, and the emitter's needs are smaller — no receiver, no result type, just a C entry point.

The padding rule needed its own check rather than an appeal to precedent, and the check is what saved the slice. Padding an omitted trailing argument with an `undefined` literal is sound only where explicit `undefined` means what absence means — the rule `lastIndexOf` violates (plan-notes 83) and `repeat` and friends satisfy (plan-notes 82). The first cut of this slice padded all four optionals and had the C side read `JSRT_UNDEFINED` as absence. Running the four spellings against the pinned Node before believing it:

```
console.group(undefined)      -> "undefined"                  console.group()      -> (nothing)
console.assert(false, undefined) -> "Assertion failed undefined"  console.assert(false) -> "Assertion failed"
console.count(undefined)      -> "default: 1"                 console.count()      -> "default: 1"
console.countReset(undefined) -> zeroes "default"             console.countReset() -> zeroes "default"
```

So the rule splits the set: `count`/`countReset` pad, and `group`/`assert` cannot — treating `JSRT_UNDEFINED` as absence there prints nothing where Node prints something, for source a program can legally write (`assert(c, msg)` with `msg: string | undefined` is ordinary TypeScript). The same run also caught the separator: Node joins a STRING message with `": "` and anything else with a space and its inspect form, where the first cut always used `": "`.

**Decision.** `CONSOLE_METHODS` in `src/hir/nodes.ts` is the single table — `{arity, optional, fn, bare?}` per member — and `ConsoleLogCall.stderr` became `ConsoleLogCall.method`. `bare` is how a method whose omitted tail is NOT `undefined` reaches the runtime: a second C entry point (`jsrt_console_group_bare`, `jsrt_console_assert_bare`) rather than a sentinel the runtime would have to mistake for absence. That is the third answer to the `lastIndexOf` question — the first two being "pad it" and "refuse the form" — and it is available here only because the runtime function is ours to split. `consoleEntryPoint(method, width)` maps an argument count to the C call or to `null`, and it is the one place the mapping lives: the lowering pads only where `bare` is absent, the verifier asks it rather than trusting the lowering (`STA4019`, which already owned the node's void-ness), and the emitter reads it instead of counting. The gate is unchanged in shape: it admits `arity - optional <= given <= arity`. The stream split is no longer a flag anywhere — it is which C function the table names, and the golden runner's byte-for-byte comparison of BOTH streams (plan-notes 84) is what holds it to Node's, with all four explicit-`undefined` spellings now in both fixtures so the collapse cannot come back.

The four members left out are left out permanently as far as this test suite is concerned, and the reason is the suite itself rather than the difficulty: `time`/`timeEnd` print an elapsed DURATION and `trace` prints a stack, so no golden fixture can pin their output to Node byte-for-byte; `table` is a column-layout algorithm of its own, which is work, not a blocker. Recording that distinction in `SUBSET.md` and in the gate's table matters more than the four members do — a reader should not spend an afternoon discovering that `console.time` cannot be golden-tested.


## 95. The dashboard was 70% of the wrong denominator (Task 4.2, 2026-08-30)

**Observation.** Task 4.2 lists the builtins it covers: `Math`, `JSON`, `String.prototype`, `Array.prototype`, `Object`, `Map`, `Set`, `console`. The coverage table had namespaces for six of those eight. `Map` and `Set` landed at rung 7 — one hash table under two names, with `tests/golden/ts/maps.ts` and `tests/golden/js/maps.js` exercising `get`/`set`/`has`/`delete`/`clear`/`size`/`add` against Node — and were simply never added to the dashboard. Every reported percentage since has been a fraction of a surface that omitted a namespace the plan names, which is the failure mode the dashboard exists to prevent: it counts what has NOT landed rather than hiding it, and a missing namespace hides more than a missing member.

Adding them surfaced a second thing. The renderer verifies each non-empty claim by looking for the member in the fixture's source, and for a `.prototype` namespace the needle was `.member(` — call syntax, with the trailing paren there to stop `.trim` matching inside `.trimStart`. `Map.prototype.size` is a property. No fixture will ever contain `.size(`, so the member could not have been claimed at all; the paren was load-bearing for the wrong reason.

**Decision.** `Map.prototype` (10 members) and `Set.prototype` (16) are namespaces in `builtins_coverage.json`, and the total moved from 102/145 (70%) to 113/171 (66%). Nothing regressed — the denominator got honest, and a dashboard whose number can only go up is not measuring anything. The surface lists are the members a program reaches for on the PINNED Node, which is now written down in the table's own comment: Symbol-keyed members are out, `Map.prototype.getOrInsert`/`getOrInsertComputed` are out as stage-3 additions, and the ES2025 `Set` operations are in because the pinned Node has them and a program can call them.

The needle became access syntax that must not be followed by an identifier character — `/\.member(?![A-Za-z0-9_$])/` — which checks a property and a method alike and still refuses `.trimStart` for `.trim`. It is strictly more general than the paren rule it replaces, and it is what makes `size` claimable.

Both gaps this exposes are one gap: `entries`/`forEach`/`keys`/`values` are missing from `Map`, from `Set`, and (minus `forEach`) from `Array.prototype`, all waiting on the same iteration protocol. That is worth knowing as one blocker rather than three coincidences.


## 96. A `throw` inside an array callback did neither of the two things it must (Task 4.2, 2026-08-30)

**Observation.** Setting out to add `Map.prototype.forEach`, the first question was how `Array.prototype.forEach` handles a callback that throws — the answer being the template to copy. It does not handle it at all. This program:

```ts
const xs: number[] = [1, 2, 3];
try {
  xs.forEach((x: number): void => { console.log(x); if (x === 2) { throw 'stop'; } });
} catch (e) { console.log(typeof e); }
console.log('after');
```

prints `1 2 string after` on the pinned Node and printed `1 2 3 after` compiled. Two distinct failures in one line of output: the walk CONTINUED past the throw (the `3`), and the exception was SWALLOWED (no `string` — the catch never ran). Either alone is a semantics bug; together they mean a compiled program silently runs past a `throw`, which is the worst failure mode in the list.

The cause is that the exception protocol has two halves and the callback slice wired neither. `runtime/include/jsrt_value.h` states the contract: an exception is a per-thread pending flag, and "after every call that can run user code, generated C checks `jsrt_pending()` and jumps to a landing pad". `emitPendingCheck` in the emitter says the same from the other side — a throwing operation is emitted as its own STATEMENT, never inside a consumer's expression, precisely so the check can stand between the operation and its consumer. Both statements were true of `call`, `new` and `method-call`. An `array-op` was neither: the runtime's loop guard asked only `i < len && i < arr(array)->length`, and the emitter returned the op as an expression for a consumer to embed, leaving nowhere for a check to stand.

This is the ordinary shape of the bug this codebase keeps finding: a fact stated in one place ("operations that run user code need a pending check") and a new node kind added without the table that would have forced the question.

**Decision.** The fact becomes a table entry. `ARRAY_OPS` gains `calls: true` on the thirteen ops that call back into compiled code, read through `arrayOpCallsBack` — the `consoleEntryPoint` idiom, because an optional property on an `as const` table is not readable off the union without it. The emitter gives such an op its own statement into the receiver's slot (dead by then) and follows it with `emitPendingCheck`, the same three lines `call` already had. The runtime's ten upward walks now share one guard, `walking(array, i, len)`, whose third conjunct is `!jsrt_pending()`; the three downward walks test it in their loop condition; and `sort` bails out of both `sort_range` and `sort_merge`, the latter skipping its write-back because a half-finished merge would DUPLICATE elements if copied over the receiver. Extracting the shared guard also removed ten copies of a condition, which the duplication budget notices in the right direction.

Two things checked rather than assumed. Getters run user code too — they lower to a `method-call`, which always had the check, so they were never affected (verified on the emitted C). And the partial answers these ops now return (a half-built `map` result, a partly sorted receiver) are exactly what the pending-check contract already says nothing may observe: the consumer jumps to its landing pad instead of reading the slot.

The regression is pinned where it cannot come back quietly: both `array_callbacks` golden fixtures now throw from a callback, a predicate, a comparator and a reducer, and are held to Node byte-for-byte on both streams.

## 97. `forEach` was never an iterator question (Task 4.2, 2026-08-30)

**Context.** Rung 7 landed `Map` and `Set` and deferred, in one breath, "iteration of any kind (`for-of`, `keys`, `values`, `entries`, `forEach`)". Four of those five are the same question — they hand back an ITERATOR, and the subset has no node for one, no `Symbol.iterator` protocol, and no way to spell the object an iterator is. `forEach` is not that question at all. It takes a CALLBACK, and calling a compiled callback is something the runtime has done since the `Array.prototype` callback slice: `jsrt_call`, the same closure ABI every compiled call site dispatches through. It was grouped with the iterator forms because they share a sentence in the spec's table of contents, not because they share a blocker.

**Decision.** `forEach` joins `COLLECTION_OPS` for both collections, under exactly the rules the array callback ops already follow: the gate holds the callback to a function type (an `any` callback in js mode defers rather than reaching `jsrt_call` unvetted), the thisArg form defers (a compiled callback has no `this` to bind), the verifier pins the arity, and the emitter gives the op its own STATEMENT followed by `emitPendingCheck` — plan-notes 96's rule, applied at the point the node was created rather than discovered later by a fixture. The runtime shares one `for_each` over both descriptors, since a Set is the same table with the value half unused: the callback's first argument is the value for a Map and the key for a Set, and the rest of the triple is identical.

**What the slice actually cost.** Not the call — the MUTATION rules. The spec has `forEach` visit entries appended during the walk, skip entries deleted before they are reached, and end when the collection is cleared. The table is append-only with `live` flags, so all three fall out of walking the entry array by index and re-reading `used` each step. Except for one thing: `grow()` is the only operation that RENUMBERS entries, because it compacts dead ones away as it rehashes — and a walk holding an index cannot survive that. A `delete` followed by enough `set`s to trigger a growth would silently skip or repeat entries, and no existing test could have caught it, because nothing before this walked the array from outside the table's own code.

`JSRTMap` therefore gained `uint32_t iterating` — a DEPTH, not a flag, because `forEach` inside `forEach` is legal and the inner walk's exit must not re-enable compaction under the outer one. While it is non-zero, `grow()` preserves dead entries in place (they keep their slots and stay unfindable, since only live entries are re-indexed) and takes a capacity bump whenever the live count alone would not have needed one. Two smaller consequences, both verified rather than assumed:

- `iterating` is initialised in `map_new` and NOT in `map_reset`, even though `map_reset` initialises everything else. `clear()` resets through `map_reset`, and a `clear()` called from inside a `forEach` must leave the counter alone — zeroing it there would re-enable compaction under the very walk that is running.
- Suppressed compaction is not a leak: the walk decrements on exit, and the next growth after that compacts as usual.

**Evidence.** Both `maps` golden fixtures cover the triple, callbacks that take fewer parameters than they are given, delete-and-reinsert ORDER (the reinsert appends at the end), mutation during the walk, growth during the walk (the preserved-index path), `clear()` during the walk, nested walks, a throwing callback, and empty collections — matching the pinned Node byte-for-byte on both streams. Dashboard: 113/171 → 115/171 (67%), `Map.prototype` 7/10, `Set.prototype` 6/16; the residue of the old five-member group is exactly the iterator quartet, which still waits on the protocol.

## 98. A -0 key was stored as -0, and `forEach` made it visible (Task 4.2, 2026-08-30)

**Found by.** The `forEach` slice, immediately. SameValueZero has always been right here — `hash_key` folds -0 into the +0 bucket and `same_value_zero` relies on C's `==`, so `has(-0)` finds a zero written as `0` and vice versa. What was wrong was the STORE: `map_put` kept the key exactly as it was handed, so a Map whose zero key was inserted as `-0` held a -0. Nothing could see it before, because every read path went back through SameValueZero. `forEach` hands the key to user code, and `1 / k` then answers -Infinity where Node answers Infinity; `console.log(m)` prints `Map(1) { -0 => 'first' }` against Node's `Map(1) { 0 => 'first' }`.

**The spec says so explicitly.** §24.1.3.9 step 6 (`Map.prototype.set`) and §24.2.3.1 step 4 (`Set.prototype.add`): "If key is -0𝔽, set key to +0𝔽". It is a normalization at INSERT, not a comparison rule — which is exactly why a table that only ever compared could not have had it.

**Fix.** One guard at the top of `map_put`, shared by `set` and `add` because both already route through it. A number key equal to zero is stored as `+0`; everything else is stored as it came. No lookup changes, because no lookup could tell the difference to begin with.

**Evidence.** Both `maps` golden fixtures now insert `-0` as the first write of its key and read it back three ways — the collection's own printing, the `forEach` key, and `1 / k` — matching the pinned Node byte-for-byte. Note the pre-existing numeric section could not have caught this: it writes `0` before `-0`, so the +0 was already in the table and the second write found it.

## 99. The lib describes Node, not the subset (Task 4.2, 2026-08-30)

**Found by.** The first line of the ES2025 set-operation fixture. `a.union(b)` did not reach the gate at all: `src/frontend/program.ts` handed user source `lib: ['lib.es2023.d.ts']`, so the checker answered *"Property 'union' does not exist on type 'Set<any>'. Do you need to change your target library? Try changing the 'lib' compiler option to 'es2025' or later."* — surfaced as `STA0012`.

**Why that message is wrong twice.** The program is valid JavaScript, and the pinned Node in `.node-version` runs it. And the advice cannot be followed: the `lib` in question is not the user's, it is the one the compiler chooses for them; a user tsconfig does not set it (plan-notes 47).

**Decision.** The lib describes the JAVASCRIPT the differential ground truth implements, not the subset Stator has landed. Those are two different jobs and two different layers: the gate is what states the subset, and its answer for a member the compiler does not do yet is `STA1214`, which names the delivering phase and is actionable. `lib`/`target` for user source therefore move to es2025 (`tests/unit/helpers.ts` follows, so the unit tests see what a build sees). The compiler's OWN tsconfig — plan §4 Task 1.0, locked — is untouched: that one is about the code in `src/`, and es2023 is what it is pinned to.

**Consequence, and it is the intended one.** Raising the lib admits every other ES2024/ES2025 member to the checker: `Object.groupBy`, `Promise.withResolvers`, the `Iterator` helpers, `Array.fromAsync`. All of them are refused by the gate as `not-yet`, which is exactly the diagnostic they deserve — a member Stator has not landed, named with the phase that will. The full suite was re-run for this: no fixture's verdict changed except the ones this slice added.

## 100. The set operations are the first op whose argument is a collection (Task 4.2, 2026-08-30)

**What landed.** The seven ES2025 set operations. Four build a new Set (`union`, `intersection`, `difference`, `symmetricDifference`) and three answer a boolean (`isSubsetOf`, `isSupersetOf`, `isDisjointFrom`). None mutates either operand.

**The new shape.** Every collection operation before these took an ELEMENT — a key, a value, a callback. These take another SET, and the runtime reads it as a `JSRTMap` through `jsrt_as_map`. A wrong argument is therefore not a wrong answer, it is a pointer read as a structure it is not; and neither of the checks the verifier already ran would catch it, because the arity is right and the RECEIVER is a Set. So the seven are a table — `SET_OPS` in `src/hir/nodes.ts`, mapping each to what it answers — that the gate, the verifier and the emitter all read: the gate refuses an argument that is not a Set, the verifier re-checks the argument's type kind and pins the result (a set for four, a boolean for three, `STA4053`), and the emitter reads the same table to decide whether to box the answer with `jsrt_bool`. This is the `ARRAY_OPS`/`CONSOLE_METHODS` discipline applied at the moment a new op family is added rather than after a bug (plan-notes 96 is what that costs otherwise).

**What the spec actually asks for, and what is refused.** The argument is a SET-LIKE record: any object with a numeric `size`, a callable `has` and a callable `keys`, read through GetSetRecord and iterated by calling `keys()`. That is the iterator protocol the subset still has no node for, so a set-like object is `not-yet(STA1214)` and a real Set is read straight out of the table. The subset fixture that spells one out is refused twice, which is the tidiest possible evidence: once for the argument, and once because writing a set-like value at all requires a `keys()`.

**Order is normative, and it is not always the receiver's.** `intersection` walks whichever collection is SMALLER and appends in that one's order — the spec's own branch, not an optimization. Verified on the pinned Node: `{9,8,7,6,5}.intersection({5,6})` is `Set(2) { 5, 6 }`, where the receiver's order would have been `6, 5`. Equal sizes walk the receiver. `union` appends the receiver's elements then the argument's new ones; `symmetricDifference` copies the receiver, then removes or appends per element of the argument, testing membership against the RECEIVER rather than the result being built (the result is losing keys while it runs). `isDisjointFrom` may walk either side, and does walk the smaller one — a boolean has no order to observe, so there the smaller walk really is just an optimization. Both `set_ops` golden fixtures pin every one of these against Node byte-for-byte, including the empty operand, a set against itself, SameValueZero over `NaN`/`-0`, and object elements (identity, so two structurally identical objects are two elements).


## 101. Vendored code is compiled with our warnings, not our warning FLAGS (Task 4.3, 2026-08-30)

**Contradiction.** `AGENTS.md` says the C runtime is built `clang -Wall -Wextra -Werror`, and the
Makefile applied that to everything under `runtime/`. Golden rule 5 says to vendor QuickJS-NG's
libregexp rather than write a regex engine. The two collide on the first build: `cutils.h` has an
unused parameter in an inline helper and `libregexp.c` compares a signed count against an unsigned
one, so `-Wextra -Werror` refuses to compile code we are required to vendor.

**Evidence.** `make -C runtime` on the unmodified vendor tree, before any flag change:

```
vendor/quickjs-ng/cutils.h:283:47: error: unused parameter 'size' [-Werror,-Wunused-parameter]
vendor/quickjs-ng/libregexp.c:2624:24: error: comparison of integers of different signs
    ('int' and 'uint32_t') [-Werror,-Wsign-compare]
```

**Decision.** `runtime/Makefile` gained `CFLAGS_VENDOR` — `-std=c11 -Wall` and the include paths,
without `-Wextra -Werror` — used by the `build/vendor_%.o` and `build-asan/vendor_%.o` rules alone.
Everything in `runtime/src/` keeps the full set. The reasoning is that a warning flag is a policy
about code we WRITE: `-Werror` exists so that a warning in our own source stops the build before it
reaches review, and there is no review here — upstream's source is not ours to fix, and patching it
to silence a warning would break the no-hand-editing rule for a cosmetic reason. What is NOT relaxed
is anything that could hide a real defect in the vendored code: `-Wall` still runs, and the ASan and
UBSan builds cover `vendor/` exactly as they cover `src/`, which is where a genuine memory or
undefined-behaviour bug in the engine would surface. `AGENTS.md`'s sentence now reads as the rule for
`runtime/src/`, which is what it always meant.

## 102. A regexp literal is a literal but not a constant (Task 4.3, 2026-08-30)

**Finding.** The obvious optimization for `/a/g.test(s)` inside a loop is to compile the pattern once
and hoist the object out — a literal with no substitutions looks exactly like the string and number
literals the const-folder already hoists. It is wrong, and observably so.

**Evidence.** ECMA-262 §22.2.4.1 evaluates a RegularExpressionLiteral by *creating* a RegExp object
each time, because `lastIndex` is mutable state ON that object. On the pinned Node:

```js
for (let i = 0; i < 3; i++) console.log(/a/g.test('banana'));  // true true true
const g = /a/g;
console.log(g.test('banana'), g.test('banana'), g.test('banana'), g.test('banana'));
// true true true false
```

The second line is the same pattern against the same subject four times, answering differently each
time, because `/g` reads and writes `lastIndex` and resets it to 0 on a failure — which is exactly
what makes `while (re.test(s))` terminate. Hoisting the first loop's literal would turn it into the
second line. Both spellings are in `tests/golden/{ts,js}/regexp.*` and match Node byte-for-byte.

**Decision.** `RegExpLiteral` is a leaf the emitter compiles at every evaluation: the pattern text is
emitted inline and `jsrt_regexp_new` runs each time the expression is reached, with one rooted frame
slot for the pattern string so it survives the flag string's allocation. The node's doc comment in
`src/hir/nodes.ts` states the invariant, so a future const-folder reads it before it reaches for
this node. The cost is a `lre_compile` per evaluation, which is the price of being right; a cache
keyed on the literal's SOURCE POSITION (one compiled program per site, a fresh object per
evaluation) is the shape a later optimization takes, and it is not this slice's business.

## 103. Three places @@split and @@replace do not do the obvious thing (Task 4.3, 2026-08-30)

**Finding.** The regexp forms of `split` and `replace` look like "find every match, then cut or
substitute". Three details in ECMA-262 §22.2.5 make the obvious implementation wrong, and each one
was found by a golden fixture diverging from the pinned Node rather than by reading ahead.

**Evidence.**

1. `@@split`'s loop is `Repeat, while q < size` (§22.2.5.14 step 14). A match starting AT the end of
   the subject is therefore never attempted, even though it is a real match — and a pattern that can
   match the empty string has one at every position including the last. The first implementation
   scanned `at <= length`, which is right for `replace` and wrong here:

   ```
   stator: [ 'a', 'b', 'c', '' ]      node: [ 'a', 'b', 'c' ]     // 'abc'.split(/(?:)/)
   stator: [ 'a', 'a', '' ]           node: [ 'a', 'a' ]          // 'abba'.split(/b*/)
   ```

   The fix is one guard in split alone: a match whose start is the subject's length ends the walk,
   and step 15's final segment covers what is left.

2. `@@split` builds its splitter with the STICKY flag added (step 7), so an attempt that fails only
   proves there is no match *at that position* — the loop advances one and tries again. `RegExpExec`
   in `@@replace` has no such retry: a forward search has already looked at every later position, so
   a failure ends the scan. That single boolean is the only difference between the two loops, which
   is why `scan()` takes it as a parameter rather than being written twice.

3. `$n` in a replacement is a group reference only where the pattern HAS that group; above the count
   it stays literal, and the two-digit form wins over the one-digit form only when both name a real
   group. `'abc'.replace(/b/, '<$1>')` prints `<$1>` on Node, and a naive substituter prints `<>`.

**Decision.** `runtime/src/jsrt_regexp.c` owns all three algorithms rather than `jsrt_string_ops.c`:
each is a reading of one `scan()` over the vendored executor, and the string file dispatches to them
on the pattern's tag. `lastIndex` follows RegExpBuiltinExec's rule and not the caller's intuition —
read and written only by a `/g` or `/y` pattern, restored untouched by `search` (§22.2.5.9), and
forced to 0 at both ends of a global `replace`. `tests/golden/{ts,js}/regexp_strings.*` pins all of
it, including the two cases above, byte-for-byte against the pinned Node.

## 104. Case mapping is not a per-unit walk, and Sigma proves it (Task 4.3, 2026-08-30)

**Contradiction.** `docs/SUBSET.md` recorded `toUpperCase`/`toLowerCase` as implemented while the
runtime ABORTED on any character above ASCII (`STA2005`, "Unicode case mapping is not yet
supported"). That was the honest state — an ASCII mapping applied to a non-ASCII string is silently
wrong for exactly the characters that made it non-ASCII — but it was a promise against a dependency
that has now arrived: libunicode came into `runtime/vendor/quickjs-ng` with libregexp.

**Evidence.** Three properties a per-code-unit walk cannot have, all pinned in
`tests/golden/{ts,js}/unicode_strings.*` against the pinned Node:

```js
'Straße'.toUpperCase()   // 'STRASSE'  -- one code point becomes TWO
'ﬃ'.toUpperCase()        // 'FFI'      -- one becomes THREE
'\u{10428}'.toUpperCase() // one code point, two code UNITS, and it has a case
'ΟΔΟΣ'.toLowerCase()     // 'οδος'     -- final sigma
'ΣΟΣ'.toLowerCase()      // 'σος'      -- the same character, both forms, one string
```

The last pair is the whole argument: the mapping of U+03A3 depends on what surrounds it, so no
table lookup keyed on the character alone can answer it. Unicode SpecialCasing's Final_Sigma
condition is "a cased character precedes and none follows, skipping case-ignorable characters in
both directions" — which is exactly why libunicode exports `lre_is_cased` and
`lre_is_case_ignorable`, two predicates the regexp engine itself never calls.

**Decision.** `runtime/src/jsrt_unicode.c` owns both operations and works in code points: decode,
map (or normalize), re-encode. The buffer is sized against the exact worst case
(`LRE_CC_RES_LEN_MAX` code points out per code point in, two UTF-16 units each) rather than grown,
because the bound is small and known. A lone surrogate round-trips untouched — it is a legal JS
string and neither operation is entitled to drop it. `jsrt_string_ops.c` keeps its ASCII fast path
and delegates the moment it sees a unit above 0x7F: an ASCII string cannot change shape, so
decoding one would buy nothing. `normalize` joined the same file rather than the string file for
the same reason `jsrt_regexp.c` owns the regexp-driven string methods — the algorithm is the
vendored library's, and this is the bridge to it.

What this slice deliberately did NOT take: `localeCompare` and `toLocaleLowerCase`/
`toLocaleUpperCase`. Those are collation and TAILORED casing — Turkish dotless i, Lithuanian dot
above — which are locale data, not Unicode's own tables, and locale data is Task 4.4's ICU
question. Answering them from the root tables would look right in a test and be wrong for the
locales that are the entire reason those methods exist.

---

## 105. The ICU feature build costs a dependency, not ten megabytes (Task 4.4, 2026-08-30)

**Contradiction.** `plan.md` Task 4.4 reads "Behind a Makefile feature flag, **off by default**
(+10 MB when on — Boa's measured cost)". The flag part landed as written. The number does not
describe what this compiler produces: 10 MB is what Boa pays because Boa links ICU **statically**
into one Rust binary. Stator links the system ICU, so the compiled program grows by two `LC_LOAD_DYLIB`
entries and nothing else, and the cost moves from the binary to a runtime dependency on a shared
library that must be present on the machine that RUNS it.

**Evidence.** The same fixture, built both ways on this machine (macOS 15, clang 17, Homebrew
`icu4c@78`):

```
87112 bytes  unicode_strings.ts, default runtime
87112 bytes  unicode_strings.ts, STATOR_RUNTIME=intl        (identical: dead-stripped, no ICU symbol referenced)
69448 bytes  intl_locale.ts,     STATOR_RUNTIME=intl        (references ICU)
```

`otool -L` on the last one adds exactly `libicui18n.78.dylib` and `libicuuc.78.dylib`; the default
build's only dependency is `libSystem`. What those two dylibs pull in is 37 MB on disk, 32 MB of it
`libicudata` — the CLDR tables, which is the real number and nearly four times the plan's.

**Decision.** Keep the flag, correct the cost, and say where it lands. `plan.md`'s Task 4.4 line is
edited in this change (golden rule 6). Three consequences the plan did not anticipate:

1. **A separate object directory, not a flag on the same one.** `make -C runtime intl` writes
   `build-intl/`, parallel to `build-asan/`. `make` detects a stale timestamp, never a stale
   `-DJSRT_HAVE_ICU`, so reusing `build/` would silently mix objects compiled with and without ICU.
2. **The link flags are written next to the archive** (`build-intl/link-flags.txt`, from the same
   `pkg-config` invocation that compiled it) and read back by `src/cli/build.ts`. Asking pkg-config
   a second time, in a different environment, is how a binary ends up linking a different ICU than
   its archive was compiled against.
3. **`jsrt_intl.c` compiles in BOTH builds.** Without ICU its three entry points are `STA2005`
   aborts naming the flag. The gate refuses them long before that (`STA1215`), which makes the
   gate's refusal an optimisation rather than the only thing between the user and a linker error.

**The locale argument is required, with the flag on.** §22.1.3.12 and §22.1.3.26 read the HOST's
default locale when `locales` is absent, which would make a compiled program's output depend on the
machine that runs it — and every golden test in this repo rests on that not being true. So the
absent form stays refused even under `STATOR_RUNTIME=intl`, and `'a'.localeCompare('b')` is a
`STA1214`, not a bug. `locales` as a string ARRAY and the `options` bag are Intl negotiation this
compiler does not model, and are refused the same way.

**Why the answers match Node byte-for-byte.** `process.versions.icu` on the pinned Node 26.7.0 is
`78.3` with `icu_small: false`, and `/opt/homebrew/opt/icu4c@78` is ICU 78.3 / Unicode 17.0 — the
same CLDR data, so `'ä'.localeCompare('z', 'sv')` answers `1` on both sides for the same reason.
This is a property of THIS machine, not of the design, which is why the intl fixtures are named
`intl_*`, skipped by the default golden run, and proven by `pnpm run test:intl` rather than by
`pnpm run ci` — a CI host without ICU must stay green.

---

## 106. Nothing linked `-lgc`, and no machine had noticed (Task 4.5, 2026-08-30)

**Contradiction.** `runtime/Makefile` has discovered Boehm through `pkg-config bdw-gc` since Task
2.5 and compiles `GC_MALLOC` calls when it finds it. `src/cli/build.ts` — the driver that links
every compiled program against that archive — never passed `$(GC_LIBS)`. The two halves of the
same decision were written in different files and never compared.

**Evidence.** Installing `bdw-gc` (the line `docs/TOOLCHAIN.md` prescribes, needed for this task's
own Check) turned all 79 golden fixtures red at once:

```
Undefined symbols for architecture arm64:
  "_GC_malloc", referenced from:
      _jsrt_string_from_utf8 in libjsrt.a[16](jsrt_string.o)
golden: 79 fixtures — 0 passed, 79 failed
```

Every machine this repo had run on lacked `bdw-gc`, so the fallback path was the only path ever
taken and a link line that could not work was never executed.

**Decision.** The fix is the mechanism Task 4.4 had just built for ICU, generalised: **every** build
records the libraries a program linking its archive needs, into the directory that archive lives in
(`build/link-flags.txt`, `build-asan/`, `build-intl/`), and `src/cli/build.ts` reads that file back
for every flavour. The flags are written by the PHONY target rather than the archive rule, because
installing `bdw-gc` changes the answer without changing a single `.c` file — the archive is
up to date and the flags are not.

**What it cost to not have this.** Nothing yet, and that is the point: under a conservative
collector a missing root is invisible, and under a link that cannot happen the fallback is
invisible too. Both are found by the same thing — actually running the configuration.

---

## 107. The frame audit found three slots the emitter never writes (Task 4.5, 2026-08-30)

**Context.** `plan.md` Task 4.5 asks for "a codegen test that diffs emitted frames against emitted
locals". `JSRT_FRAME(n)` is written once, at the top of a function, before a line of its body
exists: a counting pass decides n and the emitter then writes whatever it writes. Nothing in C
checks the two agree, and under Boehm nothing at RUNTIME checks either — the collector scans the
stack conservatively and finds the value regardless. It stops being invisible when §12's precise GC
lands, which is the moment the discipline exists to survive.

**Evidence.** `tests/unit/frames.test.ts` emits the C for every standalone golden fixture and holds
each function to four invariants. Written against the tree as it stood, it failed on three separate
over-allocations, all of them the counting pass reserving storage the emitter had a better home for:

1. **A captured local got two homes.** The parameter loop already skipped a name in `fn.envVars`
   ("one variable, one home"), because a captured binding lives in the heap environment and
   `slotRef` reads it there. `countBindings` did not: `closures.ts:_jsrt_fn_0` declared
   `JSRT_FRAME(2)` and wrote only slot 0. Fixed by routing every named binding — parameters,
   declarations, function declarations, `for…of` bindings, catch bindings — through one `bindSlot`
   that holds the rule in one place.
2. **Every function reserved a return slot.** The slot that holds a result across `JSRT_FRAME_POP()`
   was claimed unconditionally, including in functions with no `return <expr>` at all. Now claimed
   after counting, and only if the body produced one. A function that roots nothing then needs a
   frame of zero, which C11 has no array for, so the frame takes the floor `JSRT_GLOBALS(n)` has
   always had: one slot.
3. **`{}` reserved a scratch slot it had nothing to store.** `dyn-object-literal` claimed two slots
   — the object and one value scratch reused per entry — where the empty literal has no entry.

**The one reservation that stays conservative.** A `try`/`finally` claims a slot to stash a caught
exception while the finally body runs. Whether that path exists is decided while EMITTING the try
body (a landing-pad label is marked used, or it is not), long after n had to be final. Predicting it
during counting would mean a second copy of the unwind analysis drifting from the first — precisely
the failure this test exists to catch. So the test counts the allowance instead: one unwritten slot
per finally whose throw path never armed, and every other unwritten slot is a failure.

**Decision.** Keep the audit exact rather than approximate. An over-allocated slot is harmless
today; a counting pass that has quietly stopped describing the emitter it feeds is not, and the
only difference between the two is how long you wait.

---

## 108. Boehm could not see a single reference the runtime held

**Contradiction.** Task 4.5 landed a leak test that proves the collector reclaims garbage. It does.
What no test asked was whether it keeps what is still live — and it did not. Boehm is
*conservative*: it scans memory word by word and retains anything that looks like a heap address.
A `jsrt_value` never looks like one. NaN-boxing puts the tag above bit 48, so every boxed reference
— in a Map's entry table, an array's element buffer, an object slot, a `JSRT_LOCAL` — reads to the
collector as a word that is not a pointer. Every object reachable only through a boxed reference
was garbage the moment the last raw pointer to it left a register.

**Evidence.** A probe built a 200-entry Map of strings, then read the entries back. Twice:

```
--- no collection:
status 0 signal null
stdout: "key-0-payload-that-is-long-enough-to-notice\nkey-150-payload…\n200\n"
--- with collection (200 000 throwaway strings, then GC_gcollect() twice):
status null signal SIGSEGV
stdout: ""
```

Nothing about this is marginal, and nothing about it was visible: every existing golden fixture
allocates far too little to reach Boehm's first collection, so the whole suite passed on the fact
that the collector had never run. The leak test's 10M-object loop *does* collect — and passed
because its objects are genuinely dead.

**Why the one-line fix does not exist.** `GC_set_pointer_mask`/`GC_set_pointer_shift` — Boehm's own
support for tagged pointers, which is exactly this problem — landed after 8.2. The pinned
`bdw-gc 8.2.12` headers do not declare them.

**Fix.** Unbox for the collector at the two places a reference can hide, in one new file,
`runtime/src/jsrt_gc.c`:

1. **The heap.** A custom object kind (`GC_new_kind` + `GC_new_proc`) whose mark procedure masks
   every word with `JSRT_PAYLOAD_MASK` before testing it. All fourteen collected allocations now
   come from one `jsrt_gc_alloc`, so the kind covers the whole heap by construction — previously
   each site spelled its own `#ifdef JSRT_HAVE_BOEHM … GC_MALLOC … #else … malloc … #endif`, which
   is also why the mistake could hide in plain sight.
2. **The roots.** `GC_set_push_other_roots` over the `JSRT_FRAME` shadow stack, unboxing each slot
   into a buffer of raw pointers and pushing that eagerly. This is the first thing that ever *read*
   the shadow stack: until now `JSRT_FRAME` was bookkeeping for a precise GC that has not landed,
   and the C stack scan found locals by accident.

Masking is safe for both word shapes the runtime stores — a boxed payload is the low 48 bits, and a
raw pointer's top 16 bits are zero, which `jsrt_init` already asserts against a real allocation, so
the mask is the identity on raw pointers. A word that is neither (a double, a length) can mask to a
plausible address and retain one object it does not own: ordinary conservative behaviour, costing
memory and never correctness.

**Check.** `tests/golden/ts/gc_reachability.ts` holds a 200-entry Map, a 200-element array and a
local string live across 200 000 throwaway allocations — enough that the collector runs repeatedly
while they are reachable only through boxed references — and prints them back. It is not vacuous:
with the two hooks removed and `GC_MALLOC` restored, the fixture is the one failure in the suite,
`compiled binary exited null` (SIGSEGV). With them, `golden: 80 fixtures — 80 passed, 0 failed`.

**The second cell, found by the same reasoning.** `jsrt_throw`'s pending-exception mailbox is a
`_Thread_local static jsrt_value` — static storage, which a conservative collector reads no better
than it reads the heap. jsrt_value.h had already written the invariant down ("the collector must
trace the pending slot as a root alongside the frame chain") and nothing implemented it. A `finally`
running on the way out is not a hypothetical window: it runs arbitrary code, allocates freely, and
the throwing frame is already popped. `jsrt_pending_slot()` publishes the cell and the root walk
pushes it.

**Honest limit on the second half.** The fixture's `unwinding()` case — value built and thrown in a
callee, caught by the caller, 200 000 allocations in the `finally` between — still passes with that
root removed. It is kept because throwing through a collecting `finally` is worth exercising, but it
does NOT prove the root: at `-O2` the thrown value plausibly survives in a callee-saved register,
which the collector scans. The fix stands on the argument, not on a red test, and the argument is
the same one the mark procedure rests on. This is exactly the sort of thing §12's precise GC exists
to stop depending on.

**What this says about the tests that were green.** They were green on luck: a suite whose programs
are all too small to trigger a collection cannot distinguish a working collector from one that
never runs. The fixture above is the first that forces the question, and every future one that
holds a collection's worth of live data now has something to fail against.

## 109. The v2.1 changelog said there were no commits after commits existed (2026-08-30)

**Contradiction.** The v2.1 verification entry in `plan.md` continued to say “no initial commit”
long after the Phase 1 and Phase 3 implementation snapshots had been committed (`fa13a50` and
`311007d`). That sentence was true when v2.1 was written, but became stale and contradicted the
repository history while still correctly describing the open Phase-0 gate.

**Fix.** Reworded the entry to keep the authoritative fact — Phase 0 has no human-approved
`NICHE.md`/`phase-0-approved` tag and still gates Phase 2 — while recording that implementation
snapshots are now committed.

## 110. Private class fields leaked through object reflection (2026-08-30)

**Finding.** Fixed-class instances exposed `#private` slots through `Object.keys`,
`Object.getOwnPropertyNames`, `Object.values`, `Object.entries`, and `Object.hasOwn`,
although ECMAScript private elements are not ordinary own properties.

**Fix/check.** Reflection now skips private field names in `runtime/src/jsrt_object_ops.c`;
`tests/golden/ts/private.ts` covers keys, names, and ownership while preserving public fields.

## 111. Array filter reread mutated elements after callbacks (2026-08-30)

**Finding.** `Array.prototype.filter` loaded an element for the callback and reread the array
afterward when appending, so a callback mutating that index changed the value being selected.
ECMAScript filter snapshots each visited value before invoking the callback.

**Fix/check.** The runtime now appends the pre-callback value; TS and JS callback golden fixtures
cover the mutation case in `tests/golden/{ts,js}/array_callbacks.*`.

## 112. Dynamic object reflection used insertion order for integer keys (2026-08-30)

**Finding.** Dynamic objects returned integer-like property names in insertion order, producing
different `Object.keys` and `JSON.stringify` output from Node's OrdinaryOwnPropertyKeys ordering.

**Fix/check.** Shapes now expose one canonical order helper that sorts array-index keys numerically
before other keys in insertion order; object reflection and printing share it. Covered by
`tests/golden/{ts,js}/object_builtins.*`.

## 113. Unicode regexp empty matches could loop forever (2026-08-30)

**Finding.** String regexp operations advanced an empty Unicode match by one UTF-16 code unit.
When that landed on a surrogate boundary, the regexp engine rewound and returned the same match,
making `split`/`replace` hang on astral characters.

**Fix/check.** Added the spec's AdvanceStringIndex surrogate-pair step and used it for failed sticky
retries and empty matches; `tests/golden/{ts,js}/regexp_strings.*` covers split and replace.

## 114. Array index validation cast an unchecked double to uint32 (2026-08-30)

**Finding.** `index_of` cast arbitrary doubles to `uint32_t` before checking range. Values such as
Infinity or a huge finite number make that conversion undefined in C and can trip sanitizers.

**Fix/check.** Range and integrality are checked against the double before conversion in
`runtime/src/jsrt_value.c`; runtime builds remain clean under the existing strict warning flags.

## 110. A live diagnostic code had been renumbered, and nothing could tell (Task 4.6, 2026-08-30)

**Contradiction.** `docs/DIAGNOSTICS.md` is the sole allocator of `STA` codes, and four codes were
being emitted with no row in it: `STA1216` and `STA1217` from `src/frontend/gate.ts`, `STA4087` and
`STA4088` from `src/hir/verify.ts`. Three were ordinary omissions. The fourth was not: `STA1216` was
top-level await, which the table had already allocated as **`STA1208`** — a live code, renumbered in
place. Nothing failed. No test references a code that is never emitted, and no check compares the
emitted set against the allocated one, so a renumbering reads as a clean build in both directions:
the old code silently stops existing, and the new one silently starts.

**Fix.** `gate.ts` emits `STA1208` for top-level await again, and the Promise-callback diagnostic
took `STA1216` so the not-yet band stays contiguous — with its `phase` corrected from 4 to 5, which
is where a runtime-level catch around a JS callback actually lands. `STA4087`/`STA4088` got the rows
they never had. The reserved ranges in `docs/DIAGNOSTICS.md` moved to match (`STA1217–STA1299`,
`STA4089–STA4999`), and `STA1207`/`STA1208` lost the "Phase 4" label they no longer deserve — both
are Phase 7 module features, corrected in `docs/SUBSET.md` too.

**What made it findable.** Reading every `code: 'STA` in `src/` and diffing that set against the
table's rows — a script, not an eye. Worth automating into `ci` as a bidirectional check (emitted ⊆
allocated, and each allocated code either emitted or explicitly retired), which is the only thing
that would have caught this at the commit that introduced it rather than a phase later. Not done in
this task; recorded here so the next diagnostics change has the reason in front of it.

## 111. The subset matrix claimed a feature was deferred while it compiled (Task 4.6, 2026-08-30)

**Contradiction.** `docs/SUBSET.md` carried `async`/`await` and generators as ONE row, marked
not-yet under `STA1201`, and the decision tests agreed — `subset_async_functions_generators_{ts,js}`
asserted `not-yet`. But async functions already compiled, and had since the codegen work that landed
`jsrt_async_start`. Only generators were still refused. The bundled row made the matrix wrong about
both: it under-reported what worked and hid that the gate's `STA1201` had narrowed to generators
alone.

**Fix.** Split the row and the fixtures. `subset_async_functions_{ts,js}` assert `static`/`dynamic`;
`subset_generators_{ts,js}` assert `not-yet` with `STA1201`, and the `SUBSET.md` code row for
`STA1201` is generators-only. The js-mode async fixture is `dynamic`, not `static` — an untyped
parameter widens to `Unknown`, and an await of an `Unknown` is a dynamic await.

**Second finding, from the same fixtures.** `subset_top_level_await_{ts,js}` had been carrying
`@expected-fail: true` on the belief that js mode answered `STA0012` (a TypeScript-level syntax
error) rather than the gate's diagnostic. It does not. That verdict came from running `explain` on a
`.js` file WITHOUT `--mode=js`, which defaults to ts mode, where a `.js` root trips `allowJs` and
fails before the gate ever sees the await. The subset runner passes `--mode` from the `@mode`
directive, so both fixtures report `STA1208` correctly and the markers came off. A diagnostic read
from a hand-run CLI invocation is only as trustworthy as its flags.

## 112. Task 4.6 promised generators and Phase 4 ends without them (Task 4.6, 2026-08-30)

**Contradiction.** `plan.md` Task 4.6 is titled "`async`/`await` + generators", and `STA1201` said
so too: *"async/await and generators are not yet supported; planned for Phase 4 (runtime v1)"*. The
async half landed. The generator half did not, and Phase 4 has no other task that could deliver it —
so the phase would have closed with a diagnostic naming it as the deliverer, pointing at a phase
that was over. A not-yet code whose named phase has already shipped is worse than no phase at all:
it reads as a schedule and is actually a dead end.

**Evidence for the split.** What Task 4.6 built is the suspension mechanism — a body re-entered at
numbered resume points, with the locals that outlive a suspension living in a heap environment. A
generator needs all of that and one more thing the async work had no reason to build: the ITERATOR
protocol. An `await` answers a *scheduler*, which is why `jsrt_promise_subscribe` is the whole
interface; a `yield` answers its *caller*, through an object with `next`/`return`/`throw` that hands
back `{ value, done }`. That protocol is not generator-specific, and the builtins dashboard had
already been saying so from the other end: `entries`, `keys` and `values` are the exact residue of
`Array.prototype` (34/37), `Map.prototype` (7/10) and `Set.prototype` (13/16), missing for one
shared reason, alongside `for-of`.

**Fix.** Four surfaces, one blocker, one owner: **Phase 5, step 8** now carries the iterator
protocol with generators last, and `STA1201` names Phase 5 in the gate, in `docs/DIAGNOSTICS.md` and
in `docs/SUBSET.md` — with its message narrowed to generators, since async no longer reports it.
Phase 5 is where it belongs on the merits rather than by elimination: the protocol is core language
surface both modes need, and it is lowering work, not runtime work, so Phase 4 was never its home.

## 115. `plan.md` split: finished work moved to `done.md` (2026-08-31)

**Problem.** `plan.md` had grown to 761 lines and 494 of them were completion records — Phase 3's
Task 3.3 alone was 275 lines of rung-by-rung evidence. The file is read top-down to find the first
unmet Check (§15.1), so every landed task made that job harder. A roadmap that grows as work
finishes is measuring the wrong thing.

**Split.** Evidence narratives for Phases 1-3 (complete) and Phase 4's landed tasks moved to a new
`done.md` (493 lines). `plan.md` is now 387 lines and holds open work only.

**What deliberately did NOT move**, because the split must not cost anything:
1. **Normative residue.** The locked `tsconfig.json` stays in §4 — it is normative under §15.7 and
   changing it requires a plan edit. `done.md` is an archive; nothing in it binds.
2. **Live Checks.** Phase 4's Check stays in §7: the phase is open (Task 4.2 in progress).
3. **Unlanded parts of landed tasks.** Task 4.2's gate rule ("every global except `console.log` and
   `undefined` is deferred with a not-yet") is behaviour, not history, and stayed.
4. **Task numbers and titles.** Roughly 60 `plan.md §N Task X.Y` references live in `docs/`, `src/`,
   `runtime/src/` and `tests/`. Every task keeps a struck-through one-line stub in `plan.md` under
   its original section, so all of them still resolve — in both files, since `done.md` repeats the
   numbering. Section numbers §0-§16 are unchanged.

**Verification.** Every line of the pre-split `plan.md` at least 60 characters long was checked to
appear verbatim in `plan.md` + `done.md`. Three do not, all intentional: the Phase 1 intro paragraph
(rewritten — its "nothing is committed yet" follow-up is closed as of the 2026-08-30 commits) and
the Phase 2 and Phase 3 headers (retitled `✅ COMPLETE`). One line WAS lost by the first pass — the
Task 4.2 gate rule in item 3 — and this check is what caught it; it was restored.

**AGENTS.md edited:** yes. Golden rule 1 now requires moving a task's record to `done.md` in the
same change its Check passes, and names the four things that never move. The workflow gains the
step and the repo map gains the file.

**Numbering note.** This entry is **115** because 110-114 are taken and **110, 111 and 112 are each
used twice** — a second run restarts at 110 partway down the file. That predates this change and is
not fixed here: commit 5e9f2b4 already cites "plan-notes 112", and renumbering an evidence log to
resolve a collision is the same mistake `DIAGNOSTICS.md` forbids for codes. Owner call.

## 116. Phase 4 had a Check but no scope, so its not-yet codes had nowhere to point (2026-09-01)

**Root cause.** Entry 112 fixed `STA1201`'s dead-end phase pointer one code at a time. It was one
instance of a structural defect: **Phase 4 never defined what it contained.** It has a Check
(runtime tests, ASan, leak test, dashboard renders, one async golden test) but no scope boundary, so
"is Phase 4 done?" was unanswerable — and four more codes named it as their deliverer while it
closed. Fixing pointers one at a time would have kept reproducing the bug.

**What the audit found**, beyond the five known pointers:
1. **`Date` was owned by nobody.** `STA1210` and `SUBSET.md` both named "Phase 4 Task 4.2", but
   Task 4.2's builtin list is `Math`, `JSON`, `String.prototype`, `Array.prototype`, `Object`,
   `Map`, `Set`, `console` — `Date` is not in it, and `Date` is not on the dashboard at all.
2. **`SUBSET.md` and `DIAGNOSTICS.md` disagreed.** `STA1207` and `STA1208` were **Phase 7** in
   `SUBSET.md` and **Phase 4** in `DIAGNOSTICS.md`, with the gate emitting 4. Phase 7 is FFI;
   neither code has anything to do with it. Nobody had reasoned either number.
3. **Task 4.2's completion bar is unmeetable for three members.** "A builtin counts as implemented
   when ≥1 golden test exercises it and matches Node" cannot ever be satisfied by `Math.random`,
   `Date.now()` or zero-argument `new Date()`. `random` sits in `builtins_coverage.json` with an
   empty fixture list, counted against coverage, so `Math` could never exceed 42/43 and the phase
   exit could never be reached. The only existing carve-out (`intl_*`) is about the BUILD, not
   determinism.
4. **58 gate call sites hardcode phase 4** for the parameterized `STA1214`, several already wrong
   (`Promise.${method}` belongs to Phase 5 step 11 under `STA1216`; `an async method` to Phase 5).
5. **`STA1214`'s table row claimed Phase 3**, which is meaningless for a code whose message names
   the phase per construct — and Phase 3 is closed.

**Fixes.** Phase 4 gets an explicit **exit criterion** listing the members whose blocker it owns,
with the residue assigned by blocker rather than by whichever phase was open: `matchAll` splits from
`match` (it answers an iterator → Phase 5 step 8) while `exec`/`match` stay Phase 4 (an ARRAY WITH
PROPERTIES, which is Task 4.1's hybrid extended to arrays — the gate comment already named this);
`STA1208` → Phase 5 step 9 and `STA1207` → step 10, both new steps with their blockers spelled out;
`Date` joins Task 4.2's list explicitly; the descriptor/prototype surface goes to Phase 8 where
`STA1204` already sits. Task 4.2 gains a **determinism carve-out** — nondeterministic members land
with a range/property proof and are marked in the dashboard, not counted missing forever. New
**Task 4.7** walks all 58 hardcoded pointers and adds the test that would have caught this class
without anyone reading a table: a not-yet diagnostic must not name a phase already marked complete.
Phase 5 is retitled "`js` mode, and the language surface Phase 4 deferred", because steps 8–11 are
not `js`-mode work and pretending otherwise is how a phase becomes a bucket.

**Rule added to the plan (§7, and it generalizes).** A `not-yet` diagnostic names the phase that
owns its **blocker**, never the phase that happens to be open. When a phase closes, every code
naming it is either delivered or reassigned in that same change.

**Also fixed while here:** `docs/TOOLCHAIN.md` claimed Ryū was vendored at `runtime/vendor/ryu/`.
It is not, and never was — entry 28 records why, and `runtime/vendor/` contains only `quickjs-ng`.
The line now says so and points at entry 28.

**plan.md edited:** yes — §7 (exit criterion, Task 4.2 carve-out and `Date`, new Task 4.7), §8
(retitle, step 8 corrected from "three surfaces" to four, new steps 9–11), §16 (v2.2 resumes the log
for Phases 2–4, v2.3 records the `done.md` split and this change).

## 118. Phase-4 completion records must not duplicate the active roadmap (2026-09-01)

**Review.** The Phase 1–3 records had been reduced to the required task-number/title stubs in
`plan.md`, but four already-landed Phase-4 records (Tasks 4.3–4.6) still repeated their completion
status and evidence there even though their full narratives already lived in `done.md`. That made the
open roadmap ambiguous about whether those tasks still had work.

**Resolution.** Replaced the duplicate Task 4.3–4.6 narratives with struck-through stubs pointing to
`done.md`. Task 4.1 remains active: fixed and dynamic objects are archived, but the Phase-4 exit
still needs arrays carrying match properties for `RegExp.prototype.exec` and
`String.prototype.match`. Task 4.2 remains active: `pnpm run test:builtins` currently reports
**131/197** members, with Math 21/43 and Object 6/13 among its open surface. No task was marked done
without its Check.

## 119. Math transcendental slice completed and dashboard synchronized (2026-09-01)

**Implementation/check.** Vendored fdlibm now backs the remaining Math transcendental wrappers, with
V8-compatible binary/degenerate `hypot` handling and a deterministic xorshift `Math.random` proof.
The new `tests/golden/ts/math_transcendental.ts` matches Node byte-for-byte; the unit range/
variation test proves `Math.random` under the determinism carve-out.

**Plan/dashboard update.** Added the transcendental fixture claims and nondeterministic proof to
`tests/golden/builtins_coverage.json`; `pnpm run test:builtins` now reports **152/196** deterministic
members (Math **42/42**, plus one carved proof). Phase 4 Task 4.2 remains open for Object, Date,
console, and the RegExp array-properties blocker.

## 120. Arrays carry a property table; `exec` and `match` land (2026-09-01)

**The blocker, restated.** Phase 4's exit criterion named one item Phase 4 owned and had not built:
an **array with properties**. ECMA-262 §22.2.7.2 builds `exec`'s answer as an array of the capture
groups that ALSO carries `index`, `input` and `groups` on it, and `console.log` prints all three —
`[ '12-ab', '12', 'ab', index: 0, input: '12-ab', groups: undefined ]`. A dense `JSRTArray` had
`length`/`capacity`/`elements` and nothing else, so `exec`, `String.prototype.match` and the
`STA1211` family sat behind it (`docs/SUBSET.md`, `src/frontend/gate.ts`).

**Resolution: one property table, two receivers.** `JSRTArray` gained the dynamic object's own
layout — `shape` + out-of-line `slots` + `slot_capacity` — and `jsrt_shape.c` now drives both
through a `PropTable` view, so `m.index` resolves through the same shape chain and the same per-site
inline cache an `o.x` does. Reuse, not a parallel implementation: a cache filled at one site stays
valid however the value was built. `shape == NULL` is "no properties", so every ordinary array pays
one NULL word and no allocation. `jsrt_dyn_property_count`/`_order` became
`jsrt_shape_property_count`/`_order`, keyed off the shape alone, because the printer and
`Object.keys` now have two kinds of owner to ask.

**Three things the spec forced that a smaller slice would have got wrong.**

1. **`groups` has a NULL PROTOTYPE**, and Node's inspector says so: `[Object: null prototype]
   { year: '2026' }`. Printing it as a plain `{ … }` would have been a byte-for-byte golden failure
   dressed up as a passing test, so a second class descriptor (`jsrt_class_null_proto`, identical to
   `jsrt_class_dynamic` in every field that means anything and distinct by ADDRESS) marks them, and
   `jsrt_is_dynobj` answers true for both.
2. **A capture that did not participate is `undefined` IN the array**, not a missing element —
   `group_value` already answered that for `split`, and the match array reuses it.
3. **`lre_get_groupnames`' stride is `strlen(name) + LRE_GROUP_NAME_TRAILER_LEN`, which is 2**, not
   1: each entry is a NUL-terminated name followed by a scope byte. Striding by one lands mid-entry
   and silently loses every name after the first — caught only because the runtime print corpus
   diffs against Node, which is exactly what that corpus is for.

**The typing decision: the match is Unknown, and that is honest.** `exec` answers
`RegExpExecArray | null`. The HIR has no union, so the node's type is Unknown and the verdict is
`dynamic` — a match array is NOT given an HType. Two routes were considered and rejected:

- Mapping `RegExpExecArray` to `array<string>` and letting the existing narrowing machinery insert a
  boundary check requires adding `array` to `CHECKABLE` in `src/frontend/narrowing.ts`. That set is
  deliberately `number | string | boolean` — a tag test cannot settle an element type, and admitting
  arrays would silently widen EVERY `unknown → T[]` narrowing in the language (`JSON.parse(t) as
  string[]` included), which is a soundness decision this task has no evidence to make.
- Giving the match array its own HType kind spreads a fourth structural type through the type model,
  the verifier and every pass, to describe one builtin's answer.

What landed instead is the discipline every other builtin surface already follows: a closed table
(`MATCH_FIELDS` in `src/hir/nodes.ts` — `index`, `input`, `groups`, `length`), one HIR node
(`MatchRead`, verifier `STA4089`), and the CHECKER as the proof that a receiver is a match
(`isMatchReceiver`, exactly how `isStringReceiver` proves a string). `m[0]` indexes it like the
dense array it is — the verifier already admitted an Unknown index target; only the gate's
`checker.isArrayType` test had to learn about it. No boundary check is inserted on these reads and
none is owed: the RUNTIME produced the values, so there is no annotation crossing a boundary to
doubt, and a receiver that is not a match panics inside `jsrt_get_prop` rather than being misread.

**What this does NOT close.** `m.map`, `m.slice`, spreading a match — anything needing the match to
have an HIR type — is `not-yet(STA1214, Phase 5)`, the union work. `STA1211` survives, with a
narrower meaning: the DATA property surface (`source`, `flags`, `lastIndex`, `global`, …) plus
`toString`/`compile`, which need reads the object model has no node for. `String.prototype.matchAll`
stays Phase 5 step 8 — it answers an ITERATOR, which is why it split from `match` in the first place
(plan-notes 116).

**Check.** `pnpm run ci` — 297 unit tests, 257 subset fixtures (192 passed / 65 expected-fail / 0
failed), 85 golden fixtures both modes, runtime print corpus matches Node, ASan/UBSan clean.
`pnpm run test:builtins`: **154/196** (was 152), `String.prototype` 31/32 (only `matchAll` left),
`RegExp.prototype` 2/15 — and the 13 remaining there are all data properties, none of them blocked
on this.

**plan.md edited:** yes — §7 Task 4.1 closed and moved to `done.md`; Task 4.2's residue and the
phase exit criterion's RegExp bullet updated to say the blocker is gone.

## 121. `RegExp.prototype`'s data properties, and the two members that stay out (2026-09-01)

**Task:** plan.md §7 Task 4.2, the residue the phase exit criterion names as `RegExp.prototype`'s
DATA property surface — the thing left after Task 4.1 closed the array-with-properties blocker.

**What it is.** Eleven properties (§22.2.6) and `toString`, all DERIVED: `source` and `flags` are
two strings on `JSRTRegExp`, `lastIndex` is a header field, and the eight flag predicates are one
bit test each against `lre_flags`. Nothing here is state the compiler has to keep in step, and
nothing needed a new representation — which is why this was never blocked on Task 4.1 and why the
exit criterion was right to call it "reads the object model has no node for" rather than a gap.

**The shape.** Two closed tables side by side rather than one: `REGEXP_OPS` (methods — a callee and
nothing else) and the new `REGEXP_FIELDS` (data — a read and nothing else). They were not merged,
though a data property is arguably a nullary method: `toString` and `source` are both arity 0, so a
single table could not tell `re.toString()` from `re.source` without a `form` discriminant, which is
two tables wearing one name. One HIR node (`regexp-read`), one verifier code (**STA4090**), the
`MatchRead` shape with the receiver pinned the other way — a regexp IS concretely typed, so the
verifier pins the receiver as it does a `RegExpOp`'s, where a match read has to pin it Unknown.

**The bug this found.** `re->flags` stored the flag string AS WRITTEN. §22.2.6.4 builds it in the
canonical `d g i m s u v y` order, and Node normalizes everywhere: `/a/ig` has `.flags === "gi"` and
PRINTS as `/a/gi`. The old `console.log(/a/ig)` therefore disagreed with Node on any literal whose
flags were out of order — a live golden-output bug that no fixture happened to write. Fixed at the
single place that can fix it, `jsrt_regexp_new`, so `flags`, `toString` and `inspect` read one
normalized string and cannot drift apart. `tests/golden/ts/regexp.ts`'s "carried verbatim" comment
was describing the bug and is corrected.

**Three members that do NOT land, each for a different reason — none of them "later":**

- **`lastIndex` as a WRITE.** `re.lastIndex = 0` is how a program restarts a /g scan, and it is not
  the read spelled backwards: it is an assignment TARGET, and `isAssignableTarget` admits an
  identifier, an element access, and a field of a CLASS — nothing else. Lowering the read into a
  store to make the spelling work would put a builtin's mutable state behind a node that was never
  designed to carry it. Refused by name (STA1214), pinned by a decision test in both modes.
- **`unicodeSets`.** In the table, unreachable in this project: the property is declared in
  `lib.es2024.regexp.d.ts` and `tsconfig.json` pins `lib: ["es2023"]`, so the CHECKER refuses the
  read before the gate sees it. Raising `lib` is a subset-wide scope change (it admits every other
  ES2024 addition at the same time) and is not this task's to make. It stays in `REGEXP_FIELDS`
  because the table describes the SPEC surface and the runtime already handles /v; the dashboard
  counts it missing, which is the honest answer.
- **`compile`.** Annex B §B.2.4 legacy — the only builtin that RECOMPILES a regexp in place — with
  an optional second argument that a fixed-`arity` op table cannot express. Keeps STA1211.

**Dashboard:** `RegExp.prototype` 2/15 → **13/15**, missing exactly `compile` and `unicodeSets`.
Total 154/196 → 165/196.

**Codes allocated:** STA4090 (verifier: a `regexp-read`'s receiver or result type), STA4091
(runtime: a flag letter outside `dgimsuvy`, STA4084-style — the emitter having invented a property).

**plan.md edited:** yes — Task 4.2's residue no longer lists the RegExp data properties, and the
phase exit criterion's `RegExp.prototype` bullet now names `compile` and `unicodeSets` with the
reasons above, neither of which Phase 4 owns.

## 122. The platform matrix found two real bugs on its first run (2026-09-01)

**Task:** the CI workflow's platform × arch matrix (`.github/workflows/ci.yml`), decomposed into
five parallel jobs — `static` once, `frontend` on six platform/arch pairs, and `runtime`, `asan`
and `intl` on the four Unix ones.

**It was not a formality.** The matrix went red on its first run for two reasons, both real, both
invisible on the machine this project is developed on:

1. **`-lm` was never linked.** macOS puts libm in libSystem, so a Darwin-only history never needed
   the flag; glibc keeps it separate, and every Linux link failed on `floor`, `fmod`, `trunc`,
   `sqrt` and `round` — ToInt32, array indexing and the print path all call one. Fixed as
   `SYS_LIBS` in `runtime/Makefile`, applied to the test-program rules AND to `link-flags.txt`,
   because `src/cli/build.ts` reads that file to link the EMITTED program: without it, `stator
   build` on Linux would have failed for any program that indexes an array, which is every program.
   The flag is a no-op on macOS, so there is no host conditional.
2. **UB in `out_units` (`runtime/src/jsrt_regexp.c`).** `memcpy(o->units + o->len, src, 0)` while
   `o->units` is still NULL: both `NULL + 0` and a zero-length `memcpy` with a null argument are
   undefined (C11 §7.24.1p2). Appending nothing is a real case — an empty replacement, a `$&` for a
   zero-length match, the tail after a match ending at the last unit — so the fix is an early
   return, not a guard at one call site. Reported by UBSan on macOS CI and NOT by the local ASan
   run, which is the whole argument for running the sanitizer job on more than one host.

**What this says about the local gate.** `pnpm run ci` passing is necessary and was never
sufficient: it proves one OS, one arch, one libc, one sanitizer build. The workflow's job map (a
comment at the top of `ci.yml`) is what keeps the two from drifting apart — every step of the
serial local chain names the parallel job that inherited it.

**plan.md edited:** no. Nothing here changes the roadmap; both fixes are defects in landed work.

## 123. Phase 0's gate is closed — the owner approved the niche (2026-09-01)

**Decision:** the repository owner approved `NICHE.md` by name, quoting its own title: "Stator
niche decision — explicit static/dynamic policy for tooling binaries". Recorded, not granted — the
gate says an agent must not self-approve it (plan.md §3 Task 0.1 step 4), and this entry exists so
that the approval has a dated record independent of the tag.

**What was approved.** The niche as written: small standalone developer-tool and worker binaries
migrating from JavaScript to strict TypeScript, under an explicit two-mode policy over ONE module
graph — `--mode=ts` strict and unapologetic about it, `--mode=js` accepting the untyped residue and
marking it dynamic, with runtime checks at every JS→typed-TS boundary and `stator explain --json`
reporting which constructs stayed static. The competitor that almost serves it is scriptc, and the
difference claimed is narrow and honest: scriptc's contract is construct-level static compilation
with an embedded QuickJS-NG fallback; Stator's is two auditable source-POLICY modes in the same
graph with typed/dynamic provenance carried through HIR.

**Two conditions ride with it**, both already in the file and now normative: scriptc is
re-evaluated QUARTERLY before further investment, and reopening this decision needs §15.4's bar —
new measured evidence recorded here — not a change of mind. The file also keeps its own
disqualifier: if the real requirement is extensible end-user scripting, embed an engine and do not
use Stator.

**Sequencing.** Phase 1 ran ahead of this gate on explicit owner instruction, recorded at the time
as an exception under §15.1 rather than as a reinterpretation of it. Closing the gate makes that
exception moot rather than retroactively correct — the rule that no phase may be entered without
its gate is unchanged.

**Actions taken:** `NICHE.md` status header updated from "proposed" to approved with the date and
the approving words; §3's status block flipped from ⏳ STILL OPEN to ✅ CLOSED with a pointer to
`done.md`; the stale "Phase 0 remains open" clause under Phase 1's open follow-up corrected; the
completion record added to `done.md` → Phase 0. The commit carrying `NICHE.md` is tagged
`phase-0-approved`, which is what Task 0.1's machine-verifiable Check reads.

**plan.md edited:** yes — §3 status and the Task 0.1 stub; the five steps stay in `plan.md` because
they are the gate's definition and §15.1 points at them.
