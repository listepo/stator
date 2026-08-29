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

---

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
