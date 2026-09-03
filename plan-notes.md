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

## 124. Phase 4's exit criterion demanded three members no golden test can hold (2026-09-01)

**Found by:** reviewing the roadmap on owner instruction, not by a failing test — which is the point.

**The defect.** §7's exit criterion listed `console` as `table`, `time`, `timeEnd`, `trace`. Task
4.2's bar is "a builtin counts as implemented when ≥1 golden test exercises it and matches Node
byte-for-byte". `console.time`/`timeEnd` print an elapsed DURATION and `console.trace` prints a
STACK — neither is a function of the program's input, so no golden test can hold either to Node.
The criterion therefore could not be met, and Phase 4 could not close, for reasons that had nothing
to do with the work remaining.

This is the SAME defect plan-notes 116 identified and fixed for `Math.random`, `Date.now()` and
zero-argument `new Date()`. The carve-out it created was correct and is unchanged; it simply was
never applied to console, because the exit criterion was written from the dashboard's
missing-members list rather than from the reasons those members were missing. `done.md`'s console
addendum had already recorded the right reasoning on 2026-08-30 — "deferred, and for a reason that
will not change" — so the two documents disagreed for two days with the archive being the correct
one, which is exactly the failure mode §15.3 exists to prevent.

**The fix.** `time`, `timeEnd` and `trace` move under the existing determinism carve-out: they land
with a shape assertion in `tests/unit/` (the label is echoed, a duration is printed, the unit is
`ms`) and are marked `nondeterministic` in `builtins_coverage.json` rather than counted against
coverage. The bar is unchanged for every member that CAN be pinned to Node.

**`table` is deliberately NOT carved out.** Its column layout is a pure function of the data it is
given — same input, same box-drawing characters, same widths — so it is ordinary Phase 4 work and
stays in the exit criterion. Carving out the whole namespace because three of its four members are
untestable would have hidden a real gap behind a real exemption.

**Rule this reinforces:** an exit criterion is written from BLOCKERS, never from a list of what is
currently red. A criterion assembled from a dashboard inherits every reason a member is missing,
including the reasons that will never change (plan-notes 116's rule, applied one level up).

**plan.md edited:** yes — §7's `console` bullet in the phase exit criterion.

## 125. `Object`'s remaining four were four different problems, not one (2026-09-01)

**Context.** Phase 4's exit criterion listed `assign`, `create`, `freeze`, `isFrozen` under one
justification: "shape work, on Task 4.1's machinery." Building them found that exactly one of the
four is shape work.

**Evidence.**

1. **`assign` is shape work, and landed.** Two-argument form, target restricted to a growable
   shape. `grep -rn "jsrt_throw" runtime/src/*.c src/codegen/*.ts` shows the write path needs no
   exception, and the golden fixture matches Node byte-for-byte.

2. **`freeze`/`isFrozen` are blocked on RUNTIME-RAISED EXCEPTIONS, not on a frozen bit.** The bit is
   trivial. The problem is what a write to a frozen object must do: §10.4.7 makes it a `TypeError`,
   and ES modules are always strict, so silently dropping the write is not an available reading.
   The runtime cannot raise one. `jsrt_throw` sets a pending cell, and every one of its three call
   sites is in `src/codegen/index.ts`, two of them literally `jsrt_throw(...); goto <pad>` — the
   pad is emitted per-function by codegen, so a library function has nothing to jump to.
   `runtime/src/` calls `jsrt_throw` zero times. `jsrt_panic` (abort) is the only tool a builtin
   has, and aborting turns a legal program into a crash.

   This was already recorded, twice, by people who were not looking for it: `docs/SUBSET.md`'s
   `JSON.stringify` row says a cycle aborts because "the spec throws TypeError, which builtins
   cannot raise yet", and `jsrt_value.h`'s `jsrt_call` comment says calling a non-function is fatal
   "until ... the runtime exceptions". Two independent notes of the same missing mechanism, and the
   exit criterion still assigned work that needs it to the phase that does not build it.

   Phase 5 step 11 builds it — "a handler's throw must become a rejection, which needs a
   runtime-level catch around user code" is the same mechanism under a different motivation.
   `freeze`/`isFrozen` move there.

3. **`create` is prototype machinery, and is `any`.** `lib.es5.d.ts` declares
   `create(o: object | null): any`, which ts mode rejects before any subset question is reached.
   And its one in-subset spelling, `Object.create(null)`, asks for a prototype-less object — which
   every object in both layouts already is, since neither has a reachable prototype. It is
   `STA1204`'s Phase 8 surface, where `getPrototypeOf`/`setPrototypeOf` already are.

**A stale pointer found on the way.** `jsrt_value.h`'s comment named **Phase 6** as the deliverer of
runtime exceptions. Phase 6 is conformance and differential fuzzing; the mechanism moved when
plan-notes 116 restructured the phases, and the comment did not. Corrected to Phase 5 step 11.

**Decision.** Phase 4's `Object` bullet is now `assign` alone. `freeze`/`isFrozen` → Phase 5 step
11; `create` → Phase 8 with `STA1204`.

**The rule this is the second instance of.** Note 124 found an exit criterion written from a list of
what was red rather than from the reasons. This is the same defect one level in: four members
grouped under one justification that fitted one of them. **A criterion that names members must name
each member's blocker, because that is the only thing that says which phase owns it** — grouping
hides exactly the mismatch that makes a phase unexitable. Checked the rest of the criterion under
this rule while here: the `console` bullet (note 124) and the `Math` bullet each now carry a
per-member reason, and no other bullet groups members under a shared justification.

## 126. Architecture diagrams added as docs/ARCHITECTURE.md (2026-09-01)

**Request.** Owner asked for a UML diagram of how Stator works, wired into AGENTS.md, plan.md, and
docs/.

**What landed.** `docs/ARCHITECTURE.md`: Mermaid renderings of plan §2 — the compile pipeline
(component view), a `stator build` invocation (sequence view), `src/` module dependencies with the
two structural invariants (`ts.Type` stops at frontend; mode stops at the gate), and value flow at
a type boundary (raw vs NaN-boxed, STA2001). Mermaid because GitHub renders it natively — no
tooling, no image files to drift.

**Plan edit.** §2's "fixed" repo layout lists docs/ files, so adding a doc file is a plan edit:
`ARCHITECTURE.md` added to that list and to AGENTS.md's repo map, plus one line in §2 stating the
diagrams visualize that section and are never an authority over it — same subordination rule as
MODES.md/SUBSET.md to §1. No spec content changed; the doc is derived, not normative.

## 127. The two open Phase-4 tasks get detailed Steps; the audit behind them (2026-09-01)

**What changed.** plan.md Task 4.2 gained two step lists (`Date`; `console.table` + the
`time`/`timeEnd`/`trace` carve-out trio), Task 4.7 gained Steps and its own Check, and the
exit-criterion `Date` bullet was rewritten per-member (the rule note 125 established). Evidence:
a five-agent audit of the working tree at `39cf053` plus measurements against the pinned Node
v26.7.0 (which the active `node` matches exactly).

**Task 4.7's count was stale.** The task said "58 call sites hardcode phase 4"; at `39cf053` the
audit counts **63** — 60 `notYet(…, 4)` (all `STA1214`) plus two `STA1211` literals
(gate.ts:1207, 2101) and one `STA1215` (gate.ts:1116). The RegExp-properties and Object.assign
slices landed after the original count. Grouping: 2 sites are purely Phase 5 step 8 (their own
comments name the iterator protocol), 2 purely step 11 (the Promise property-access pair — the
call-side Promise sites already say phase 5, but as `STA1214` while the plan assigns the surface
to `STA1216`; the code question is now an explicit step), 8 are catch-alls straddling several
owners (one hardcoded phase cannot be right for them — they need member-level splits), and **51
fit no group the plan names** (7 module-surface, 32 arity/spread/argument-shape refinements, 5
method-as-value, 4 Math/JSON residues, 2 dedicated `STA1211` + 1 `STA1215`). Assigning those 51 a
phase mechanically would recreate the lie the task exists to remove, so the step list makes "give
the blocker an owner by plan edit" part of the task. Also found: nothing in `src/` knows which
phases are complete and `gate.test.ts` never reads the `phase` field — the regression test the
task demands has no substrate, so building one (a completed-phases constant in `src/support/`) is
now step 2. `STA1215` carries `phase: 4` while its DIAGNOSTICS row says the message names a build
flag, not a phase — sentinel exemption is step 3. The async-method example the task named as wrong
was already fixed to phase 5 before this audit.

**Date slicing is forced by determinism, measured, not assumed.** With TZ=UTC vs
TZ=America/New_York on the pinned Node: `toISOString`/`toJSON`/`toUTCString`/`getTime`/the
`getUTC*` family/`Date.UTC`/ISO `Date.parse` are byte-identical (slice A); the local getters/
setters/`getTimezoneOffset`/`new Date(y,m,…)` differ by TZ (slice B — legal only after the golden
runner pins `TZ=UTC`; today all three `spawnSync` calls in tests/golden/run.ts inherit the
machine's environment); `toString` embeds an ICU CLDR long zone name ("(Coordinated Universal
Time)"), which puts the `toString` family and `toLocale*` with Task 4.4's intl feature build.
`console.log(new Date(0))` prints the ISO string — TZ-independent, so Date values are golden-safe
to print. Two divergences are documented rather than papered over: `Date.parse` is ISO-grammar
only (non-ISO answers `NaN`, which §21.4.3.2 permits; Node's non-ISO heuristics are TZ-dependent
and implementation-defined — pinned by a runtime unit test, never a golden fixture), and
`toISOString` on an Invalid Date panics until Phase 5 step 11 delivers runtime-raised exceptions
(the `freeze`/`isFrozen` precedent). `Date.now`/zero-arg `new Date()` go the `Math.random`
carve-out road. Dashboard: `Date` is absent from builtins_coverage.json entirely; adding the
namespaces is a JSON-only change (the runner iterates namespaces dynamically).

**console.table ground truth captured from the pinned Node** (it changed across Node majors:
v26.7.0 left-aligns with one-space padding, `(index)`/`Values` headers, key-union columns in
first-seen order, blank missing cells, inspect-quoted strings, header-only table for `[]`,
console.log fallback for non-tabular input, no ANSI when piped). Two scope cuts recorded:
the optional `properties` argument is refused (joins 4.7's refinement group for an owner), and v1
width counting is code points, not wcwidth display columns — non-ASCII cells may misalign vs Node
(which uses a wcwidth-style `getStringWidth`); the ceiling is named in SUBSET.md and a code
comment. One trap the steps encode: output must route through `write_grouped`, because Node
indents tables inside `console.group`. And the carve-out trio (`time`/`timeEnd`/`trace`) is NOT
implemented today (absent from `CONSOLE_METHODS`) — note 124 moved their *proof* to the
carve-out, but the members still must land; that is now an explicit step.

**Also confirmed.** The working tree's uncommitted changes are the complete, coherent
Object.assign slice plan.md records as landed 2026-09-01 (typecheck passes) plus this session's
ARCHITECTURE.md rider — the new steps build on that state and touch none of it.

## 128. `console.table` — measured first, then built (2026-09-01)

> Renumbered from 126 (2026-09-01): two sessions appended entries the same day and both picked
> 126/127 — the second occurrence of the note-115 defect. This pair was the later append; see 130.

**Why this one needed measuring.** Every other console method is a formatting rule with one shape.
`table` is a layout ALGORITHM, and the spec (WHATWG console, "table") describes what it means, not
what it draws. The only authority on the bytes is Node. So the first step was not design, it was
`node -e`-equivalent probes over ten shapes: array of objects, mixed rows, object argument, array
rows, empty, wide cells, nested inspect cells, scalar, `Map`, `Set`, and a table inside a group.

**What the probes settled**, none of which was guessable:

- A cell is a space, the content, padding to the column width, then a space — so a divider segment
  is always the width plus two.
- Column order is FIRST-SEEN across rows, with `Values` appended last if any row was not an object.
- A missing key is an EMPTY cell, not `undefined`.
- Cells are inspect form (`'x'` quoted) but the index LABEL is not (`r1`, not `'r1'`) — a key is
  not a value.
- An ARRAY row contributes its indices as column names, so `[[1,2]]` tables under `0` and `1`.
- A non-collection argument falls back to `console.log` — `console.table('scalar')` prints `scalar`.
- A `Map` gets an `(iteration index)` column and a `Key` column; a `Set` gets `(iteration index)`
  and `Values`. **A different table, not a wider one.**

**What landed.** Arrays and plain objects, both modes, held byte-for-byte by
`tests/golden/{ts,js}/console_builtins.*`. The runtime reuses what was already there rather than
re-deriving it: cells go through `inspect_value` (so a table cell and an array element can never
format differently), rows through `jsrt_object_entries` (so column order and `Object.entries` can
never disagree), and the finished grid through `write_grouped` (so the group indent applies to
every line of the table for free, which the fixture proves).

**What did not, and why by name.** The Map/Set form is refused at the gate (`STA1214`). Drawing it
means a second table shape, and a runtime that guessed at it would print something Node does not —
the failure mode a golden test exists to prevent. Refusing is the honest half.

**One ceiling, marked in the source.** Padding is by DISPLAY width, and `cell_width` implements
`getStringWidth`'s rule for the code points a cell in this subset can hold — continuation bytes
never count, combining marks count zero, East-Asian Wide and Fullwidth count two. The full Unicode
width table is not reproduced; a cell holding one of the rarer wide blocks pads one column narrow,
which misaligns a row rather than corrupting it. Named in the comment so the next person hits a
note rather than a mystery.

**Phase 4's `console` bullet is now the three carve-out proofs alone.** `time`/`timeEnd`/`trace`
were moved there by note 124 for a reason that does not change; `table` was the one member of that
bullet a golden test could ever hold, and it holds.

## 129. The carve-out's second use, and what it is actually for (2026-09-01)

> Renumbered from 127 (2026-09-01) — same collision as 128; see 130.

**Landed.** `console.time`, `console.timeEnd` and `console.trace`, proved by
`tests/unit/console-carveout.test.ts`. `console` now reads `12/12 (100%) [+3 nondeterministic]`,
and Phase 4's `console` exit-criterion bullet is ✅ MET.

**What the proof asserts, and why each assertion is there.** The carve-out is not permission to
skip a test; note 116 defined it as a DIFFERENT test, and the dashboard's checker verifies a
carved member's proof exactly as hard as a golden one (the file must exist and must mention it).
So each assertion is aimed at a specific way of faking the member:

- The label is echoed and the unit is `ms` — a shape a stub can pass, and the baseline the plan
  named ("the label is echoed, a duration is printed, the unit is `ms`").
- Two timers produce TWO lines, not four — `console.time` printing nothing is part of the contract.
- Three million adds measure longer than nothing — this is the one a constant-returning stub
  cannot pass. Magnitude is not assertable; ORDERING is.
- `trace` writes to stderr and stdout stays empty — the half of `trace` that IS reproducible.

**Two behaviours that came out of measuring Node rather than reading the spec.** Re-timing a label
that is already running keeps the ORIGINAL start (Node warns and does not restart), and
`timeEnd` on a label that was never started writes nothing to stdout. The second follows the rule
`console.countReset` already set: Node warns, this runtime has no warning channel, and the
observable stdout is identical either way.

**`trace` prints no frames, deliberately.** Node follows the prefix with a stack; this runtime has
no unwinder. `jsrt_uncaught` had already faced this exact choice and taken the same answer — its
comment says the text "intentionally does not chase Node's (which prints source excerpts and stack
frames this runtime does not have); the OBSERVABLE contract is stderr + exit 1." Fabricating frames
would make the output look right and be wrong, which is the failure mode every golden test in this
repo exists to prevent.

**Node's unit ladder is reproduced, not simplified.** Milliseconds below a second, `s` below a
minute, `m:ss.mmm` above one. The VALUE cannot match Node, but the FORMAT can, and a ten-minute
build printing `600000.000ms` would differ from Node in a way that is not the measurement's fault.
This is the line the carve-out draws in general: carve out what the machine decides, keep
everything the format decides.

## 130. A same-day race: the console work landed while its steps were being written (2026-09-01)

**What happened.** Two sessions worked this repo concurrently on 2026-09-01. One wrote detailed
Steps into plan.md for Task 4.2's remainder (`Date`, `console.table`, the carve-out trio) and
Task 4.7, grounded in a five-agent evidence audit at `39cf053` (note 127). The other implemented
`console.table` and the trio, committing `0ef7724` — which also swept the first session's
uncommitted plan edits into history. Result: plan.md briefly instructed work that was already
done, and plan-notes gained two entries numbered 126 and two numbered 127.

**Resolutions, in the order applied.**
1. **Numbering.** Second occurrence of the note-115 defect (append without checking the tail).
   Per that precedent the later pair renumbered: console.table → **128**, carve-out trio →
   **129**, with renumber banners left in place and the one inbound reference (plan.md's console
   exit bullet) repointed. Note 127 (the steps audit) keeps its number — plan.md references it
   four times.
2. **plan.md.** The console step list is replaced by a landed record pointing at 128/129; the
   Task 4.2 "still open" line now names `Date` alone; §16 v2.6 records the reconciliation. Two
   residues the steps had flagged stay open and are preserved in the record: the optional
   `properties` argument (Task 4.7's refinement group) and the `Map`/`Set` tabular form
   (`STA1214`, deferred by name in 128's landing).
3. **The count dispute is resolved in the audit's favor.** A low-cost verification pass challenged
   note 127's "63 sites" as impossible, counting 53–57 — but its method was a single-line
   `grep 'notYet.*4)'`, and many `notYet(…)` calls span lines. A multiline-aware recount
   (regex over the file, not per-line) of the post-`0ef7724` tree finds **61** `notYet(…, 4)`
   + 2 `STA1211` + 1 `STA1215` = 64, consistent with 63 at `39cf053` plus the console slices.
   The lesson is already encoded as Task 4.7 step 1: the number moves; enumerate, never assume —
   and enumerate with a parser-shaped tool, not a line grep. The same pass DID catch one real
   defect: the step list cited "plan-notes 117", an entry that does not exist (the numbering jumps
   116 → 118); the console single-table plumbing note is **94**. That citation died with the
   replaced step list — and the sweep for other "117" citations found a pre-existing one in
   `gate.ts`'s Math-surface comment, fixed to **119** (the fdlibm entry that actually completed
   the surface).

**Standing fix for the collision class.** Before appending an entry, read the last heading and
take max+1 — and when two sessions may be active, expect the tail to move between reading and
committing. This note is itself numbered by that rule.

**Amended 2026-09-01, after the third occurrence** (both 133s — see 137). "Renumber the later
append" was a proxy for the thing that actually matters, and it is the wrong proxy when the later
entry is the one everything cites: **renumber whichever duplicate has FEWER inbound references**,
then repoint those and leave a banner on the moved entry. In that collision the later entry (Date
slice B) had eight references across four files including a C source comment, and the earlier had
one — so the later one kept 133. Cascading renumbers stay forbidden either way: 134/135/136 were
already cited by commit messages, which cannot be edited.

---

## 131. Steps for every remaining phase, written against the tree rather than the task lines (2026-09-01)

**What changed.** `plan.md` had detailed Steps only where work was imminent: Phases 5–8 carried
task LINES (one paragraph each) but no executable steps, so "what is the next action" was
answerable only for Phase 4. All four now have numbered steps — Phase 5's eleven, Phase 6's three
task lists, Phase 7's three plus a phase preamble and an out-of-scope table, Phase 8's nine.
§16 gains **v2.7**.

**Method, and why it matters more than the length.** Every step was grounded by reading the current
tree, not by elaborating the task line. Done from the task lines alone, half of these steps would
describe work that is already finished or cannot work as written. What the reading changed:

1. **Phase 5 step 1 is mostly landed.** `src/frontend/program.ts` already wires `allowJs`/`checkJs`
   by mode, `src/hir/nodes.ts` already carries `provenance`, `src/lower/index.ts` has
   `provenanceOf`, and `src/cli/explain.ts` already prints `verdict (provenance)` per function. The
   step is now the **`inferred` middle grade** alone — lowering grades typed-vs-dynamic today, and
   step 5's boundary insertion keys on exactly the distinction that does not exist yet.
2. **Phase 5 step 5's proof shape was wrong.** A `.js` file whose JSDoc lies, caught at the boundary
   by `STA2001`, cannot be a Node-diff golden test: Node runs that program happily and prints the
   wrong answer, so "matches Node byte-for-byte" is the failure, not the pass. It needs an
   expected-stderr harness mode — recorded in the step so the first agent to reach it does not
   discover it by writing a fixture that cannot pass.
3. **Phase 5 step 11 is a contract change, not a builtin** — and specifically an EXTENSION of an
   existing contract, which the first draft of the step got wrong. `Promise.prototype.then` and
   `new Promise(executor)` both need a user closure's throw to become a rejection instead of
   unwinding into library C. The step originally called that a "protected call" and asked for a new
   `docs/VALUE.md` section; the verification pass found `VALUE.md` **§4.9 already defines the
   mechanism** — the pending cell and landing-pad protocol (`jsrt_throw` / `jsrt_pending` /
   `jsrt_take_exception`) — and `DIAGNOSTICS.md`'s own `STA1216` row already states the gap in one
   line: "the pending-exception protocol gives that catch to generated code, not to a builtin." So
   the step now asks for a SUBSECTION of §4.9 (a runtime-side call that checks `jsrt_pending()` on
   return and yields a completion value to the builtin) in §4.9's existing vocabulary. Inventing a
   second name for one mailbox is how a codebase ends up with two exception protocols. It also unlocks a
   backlog nobody had counted: `Object.freeze`/`isFrozen`, `toISOString` on an Invalid Date, and
   every `SUBSET.md` row reading "the spec throws, which builtins cannot raise yet" — those rows
   are IOUs written against this one mechanism, and the step says to grep for them and close or
   re-date each.
4. **Test262 cannot be vendored, and this environment cannot fetch it.** ~50k files, plus the
   no-network constraint of note 28 (the same one that deferred Ryū). So `tests/test262/` holds the
   runner and a pinned SHA; the corpus is git-ignored and fetched; a missing corpus **skips
   visibly** so `pnpm run ci` stays offline-runnable, and the CI job — not the `ci` chain — is what
   makes the number per-commit. Two anti-dishonesty rules are written in: an unmapped `features:`
   tag is a runner ERROR (otherwise a corpus bump inflates the skip bucket silently), and the pass
   rate is never printed without the skip count beside it.
5. **`tests/differential/` does not exist**, though `AGENTS.md`'s repo map names it — the map
   describes the target state. Step 1 of Task 6.2 creates it. The fuzzer is specified as
   type-directed (choose the type, then build an expression inhabiting it, so programs compile by
   construction) because a text-level generator would spend its budget rediscovering that
   unsupported syntax is unsupported; and seeded from a 10-line xorshift with **no** clock and no
   `Math.random`, so every finding replays from `--seed=N`.
6. **`tests/bench/record.ts` already exists and already gets the hard parts right** (best-of-5,
   because the minimum is the one number a scheduling hiccup cannot inflate; a `baseline.json` that
   stamps host, CPU, Node, clang, and the `-O2` string). Task 6.3 extends it rather than replacing
   it. Named traps: `ru_maxrss` is **KB on Linux, bytes on macOS** (a silent 1000× on the first
   cross-platform comparison), an absent engine must be recorded as `"absent"` rather than omitted,
   and the §12 perf gate's threshold must be measured from a same-commit double run before it is
   set — a gate below the noise floor trains people to ignore alarms.
7. **There is no scheduled workflow.** `.github/workflows/ci.yml` runs on push/PR only, so both the
   nightly fuzz and the weekly bench need a new `nightly.yml`; the seed comes from
   `github.run_number`, never the clock, so a nightly finding is replayable.
8. **Nothing under `src/frontend/` handles ambient `declare function`** — Phase 7 starts from new
   gate surface. The phase preamble now names the four things that make FFI four weeks rather than
   one line of C: pointers are invisible to Boehm for the duration of a call, UTF-16↔bytes is a
   real allocation so `string` maps to nothing implicitly, C reports errors by return value and
   never unwinds, and the two directions share only the ABI table. Two questions are marked as
   undeferrable: who owns a pointer after the call returns (borrowed or transferred — there is no
   third option the compiler can express), and what a C caller sees when an exported TS function
   throws (`stator_last_error` plus a sentinel, or abort — but a written choice either way, since
   an exception must never unwind into a C frame). An explicit out-of-scope table covers
   struct-by-value, varargs, C++, callbacks into closures, and threads. The generator's front end
   is provisionally `clang -Xclang -ast-dump=json` rather than libclang bindings: clang is already
   a hard requirement and the dependency budget is `typescript` only.
9. **QuickJS-NG is already partly vendored.** `runtime/vendor/quickjs-ng/VENDOR.md` pins `v0.16.2`
   (`1ab8676…`) for `libregexp`/`libunicode`. The interpreter ships its own copies, so Phase 8's
   vendoring step must take the **same commit** and extend the existing `VENDOR.md` — a second
   version, or a naive add of the full source beside the existing subset, is duplicate symbols at
   link time rather than a conflict any compiler will point at. Phase 8's first two steps are also
   marked as not-implementation: the human gate's evidence (named users, named blocked
   dependency — closed the way Phase 0's was, note 123), then the marshaling design doc, whose
   three questions are handles-not-copies, identity round-tripping (`x === x` across two
   crossings ⇒ a two-way handle table), and two collectors with a boundary-spanning cycle that
   leaks in v0 — a ceiling to state, not to discover.

**Ordering note.** `plan.md` §16's log is ascending; v2.7 was first appended above v2.6 and moved.
Trivial, but the same slip in a step list would put a dependency after its dependent.

**No agents were used for this pass** (owner instruction). Everything above came from direct reads
of the tree — which is also why the corrections in items 1, 5, and 9 exist: they are the kind of
"already landed" / "does not exist" / "already vendored" facts a plan-only pass cannot see.

## 132. `Date` slice A: what the plan's steps got right, and the four places the tree corrected them (2026-09-01)

Slice A landed as written in plan §7 Task 4.2's Date steps 1–7: `H_DATE` + the `DATE_OPS`/
`DATE_STATICS` tables, `runtime/src/jsrt_date.c`, the print/JSON integration, the emitter arms,
goldens in both modes, and the dashboard rows. `pnpm run ci` is the evidence. Four things the
steps specified turned out differently once the code existed, and all four are recorded because
they are decisions, not typos.

**1. The zero-argument constructor needed no node kind.** Step 2 says `gateNew` opens for Date and
zero-arg is accepted; step 3 lists `'date-new'`/`'date-op'` node kinds. The obvious reading is a
`DateNew` whose argument is optional, and the first attempt did exactly that — which immediately
split `date-new` out of the four shared switch arms it otherwise rides (counting, emission,
rewriting, `explain`, verification), because every one of them destructures `expr.arg`
unconditionally. §21.4.2.1 step 2 defines `new Date()` as *the current time value*, so the lowering
desugars it to `new Date(Date.now())` instead: a `date-static` node sitting in the `arg` slot, zero
plumbing, and the spec's own definition rather than a paraphrase of it. The distinction that makes
this a desugaring and not padding: `new Date(undefined)` is an Invalid Date, so an absent argument
and an explicit `undefined` are different programs — which is why the desugaring is to an explicit
`now` call rather than to the undefined-literal every other optional position gets.

**2. `Date.UTC` takes 1–7 arguments, not 2–7.** Step 1 says "2–7 args". §21.4.3.4 defaults `month`
to 0, and the pinned TypeScript's `lib.es5.d.ts` declares every parameter after `year` optional, so
`Date.UTC(2024)` is legal both ways and Node answers `1704067200000`. The gate accepts it. Caught
by a gate unit test asserting the refusal the plan implied; the test was wrong, not the code.

**3. The `now` coverage marker had to wait for its proof.** Step 7 says the dashboard gains `now`
as a `{"nondeterministic": …}` marker. The marker is verified as hard as a golden claim — the file
it names must exist and must mention the member — so writing it before
`tests/unit/date-clock.test.ts` existed would have failed the dashboard rather than deferred it.
That is the carve-out working as designed (note 129): the marker is not a free pass, and the
ordering it forces is proof-then-marker, never the reverse.

**4. A code collision, found by reading rather than by a test.** The first draft of
`jsrt_date.c`'s receiver assertion panicked with `STA4085`, which `docs/DIAGNOSTICS.md` had already
allocated to `JSON.stringify`'s verifier claim. Nothing would have caught this: a panic string is
not compared against anything, and both codes are internal errors nobody's test asserts. It is now
`STA4093`, allocated properly alongside the verifier's `STA4092`. The general lesson is the one
`AGENTS.md` already states — `docs/DIAGNOSTICS.md` is the sole allocator — with the addition that
*runtime panic strings are diagnostics too*, and the file is the only place that can say a number
is free.

**What is deliberately NOT in slice A, and why each is not a gap.** `Date.parse` is ISO-only: Node's
non-ISO heuristics are TZ-dependent and implementation-defined, so a golden fixture over one would
pin this machine rather than the language. A date-time string with no offset is local time and
answers `NaN` for the same reason. `toISOString` on an Invalid Date aborts where the spec throws a
`RangeError` — a builtin cannot raise until Phase 5 step 11, the `Object.freeze` ceiling exactly.
And `toJSON` answers `null` for an Invalid Date though `lib.es5.d.ts` declares it `(): string`;
§21.4.4.37 and Node both say `null`, so the divergence is the lib's, it is documented in
`docs/SUBSET.md`, and it is what makes `JSON.stringify(new Date(NaN))` the string `"null"` rather
than an abort.

**`STA1210` is now a residue code**, the shape `STA1211` has for RegExp: it names one member at a
time rather than the class. What remains under it is slice B (local time, blocked on pinning `TZ`
in the golden runner — Phase 4's own step 8) and the `toString`/`toLocale*` family (ICU CLDR data,
Task 4.4's feature build). Per §15's rule, closing Phase 4 means every member still under it is
delivered or reassigned.

---

## 137. The optimization ladder gets details, and one rung dies of a measurement (2026-09-01)

> Renumbered from 133 (2026-09-01): third occurrence of the note-115 defect — two entries the same
> day both took 133 (this one and "Date slice B"). **This time the LATER entry kept the number**,
> departing from note 130's "renumber the later append" wording, because the rule's purpose is to
> minimize repointing and the risk of a missed reference: Date slice B had eight inbound references
> across `plan.md`, `done.md`, `docs/DIAGNOSTICS.md`, `docs/SUBSET.md` and `runtime/src/jsrt_date.c`;
> this entry had one (`plan.md` §12, repointed with this change). Left in file position rather than
> moved — entries 110–114 are already out of sequence, so position is not the index. See 130's
> standing fix, amended.

`plan.md` §12 was eight table rows and four one-line practices — the only section of the plan with no
detail under it, written from research figures rather than from this tree. Details added per rung:
the entry criterion (nothing starts before Task 6.3's harness and its measured noise floor), the
discipline every rung shares (baseline on one host, revert what does not move the geomean and record
the non-gain, semantics never a variable, feature-flag anything that adds a build mode), and for each
row its actual precondition, its trap in this codebase, and its abort rule. Three of the corrections
are worth naming here because they change what the rows mean.

**Rung 1's premise does not hold for this runtime.** Boa's "5–15% from mimalloc" is an *object*-
allocator result. Here the object allocator is Boehm: `jsrt_gc_alloc` calls `GC_generic_malloc`
(`runtime/src/jsrt_gc.c`), which a swapped `malloc` never sees. What is left for an allocator swap is
the non-collected scratch (regexp captures and keys, shape key encoding, unicode buffers, JSON
digits, the `console.count`/`time` tables, Intl) plus the no-Boehm fallback where `jsrt_gc_alloc` *is*
`malloc`. So the rung is now conditional on profiling those sites, and ordered after rung 3 rather
than first if it survives at all.

**Rung 7 is measured out of the schedule.** V8's snapshot exists because V8 constructs a builtin
object graph at startup; Stator's `jsrt_init()` is a 48-bit-pointer probe plus `GC_INIT()`, and
builtins are dead-stripped C functions, not constructed objects — there is nothing to snapshot.
Measured 2026-09-01 on this machine (Apple M3 Max, Darwin 25.6, Apple clang 21.0.0, `-O2`, Boehm
build via `pkg-config bdw-gc`, Node v26.7.0; best of 15 spawns each, timed by `spawnSync` around
`process.hrtime.bigint()`), with `export {};` as the empty program and an empty `.mjs` for Node:

| program | best of 15 |
|---|---|
| `stator build` output, empty program (51,656 bytes) | **3.23 ms** |
| `node empty.mjs` | 27.04 ms |
| `/bin/true` (process-spawn floor) | 0.23 ms |

Roughly 3 ms of budget exists in total, most of it dynamic linking. The row's inherited "50–200 ms
class wins for CLI tools" is now recorded as **none available here**, effort **not scheduled**, and
the rung is gated on a profile showing a floor worth attacking. Per §15.5 this is a measurement, not
a quote: the numbers above were produced on this host and are re-measurable from the same three
programs. (The favourable half of the comparison — an 8× faster start than Node — is a *finding of
this measurement*, not a benchmark claim: it belongs to Task 6.3's harness before it is published
anywhere, per §15.5 and the §12 practice above it.)

**Two practices had no home and now point at one.** The perf-regression gate and the published
conformance number were listed in §12 as standing practices with no owning task; they are specified
in Task 6.3 step 7 and Task 6.1 steps 6–8 respectively, so §12 now cites those rather than restating
them. The per-module C split gained the same treatment in the opposite direction: it now names what
it would actually change (`emitC` returns one string, `linkExecutable` makes one `clang -O2` call)
and the cost it must be measured against (separate TUs lose cross-module inlining, which is the hole
rung 6's `-flto` fills).

No code changed; `plan.md` §12 and this entry are the whole diff.


## 133. Date slice B: the local-time inverse, and two plan corrections (2026-09-01)

**Context.** Date step 8 (plan §7 Task 4.2) — the local-time getters/setters, `getTimezoneOffset`
and the component constructor, behind a `TZ=UTC` pin on the golden runner.

**What the tree corrected in the plan.**

1. **`toDateString` is not ICU-blocked.** `docs/SUBSET.md`, `docs/DIAGNOSTICS.md` and plan §7's
   exit criterion all grouped it with `toString`/`toTimeString`/`toLocale*` as needing ICU CLDR
   names. Measured against the pinned Node under `TZ=Europe/Berlin`:
   `toString()` → `Mon Jul 15 2024 14:00:00 GMT+0200 (Central European Summer Time)`,
   `toTimeString()` → `14:00:00 GMT+0200 (Central European Summer Time)`,
   `toDateString()` → `Mon Jul 15 2024`. The third has no zone name in it, so it is a pure
   local-calendar read and landed with slice B. The other two are confirmed ICU-blocked for a
   reason now measured rather than assumed: the same instant through libc `strftime` with `%Z`
   gives `(CEST)`, the abbreviation — Node's long display name comes from ICU. All three docs and
   the exit criterion were edited in the same change.

2. **Step 9's residue claim needed widening.** It asked that the residue under `STA1210` be "exactly
   the intl family". After slice B it is `toString`, `toTimeString`, the three `toLocale*` and the
   call form `Date()` — five members and a call form, of which only three are locale-dependent in
   the `Intl` sense. The honest predicate is *ICU-dependent*, not *intl*: `toString` and
   `toTimeString` need ICU's timezone display names without going near a locale API. The docs now
   say ICU-dependent; the substance of the claim — nothing time-zone-dependent is left under the
   code — holds.

3. **A slice-A bug the new fixture caught.** `jsrt_date_to_utc_string` padded a negative year to six
   digits (`Sat, 01 Jan -000001 00:00:00 GMT`) on the strength of a comment claiming Node does. Node
   pads to four: `Fri, 01 Jan -0001 00:00:00 GMT`. Six is `toISOString`'s expanded-year form only.
   No slice-A fixture had a negative year, so nothing contradicted the comment. `write_year` now
   pads to four for both human string forms and `toISOString` keeps formatting its own year;
   `tests/golden/ts/date_local.ts` carries a year -1 through both.

**The design decision worth recording: the local→instant inverse.** `LocalTime(t) = t + LocalTZA(t)`
is a function; `UTC(local)` is not its inverse, because across a DST transition a wall-clock reading
either names no instant (the spring-forward gap) or names two (the autumn fold). The first
implementation probed once — `offset_at(local)`, subtract, re-probe, retry if the offset moved — and
is correct everywhere except the fold, where it returns the LATER instant. Node returns the earlier:
2024-10-27T02:30 in Berlin is `2024-10-27T00:30:00.000Z` (CEST), not `01:30Z` (CET).

§21.4.1.26 is explicit about why: both the gap and the fold are resolved with the offset in effect
*before* the transition, which for the fold is `possibleInstants[0]`, the earlier one. The
implementation follows the spec's own shape — probe the offset one day either side (its `before` is
`t - 1 day`), build both candidates, take the first whose own offset validates it, and fall back to
the pre-transition candidate when neither validates, which is exactly the gap. One day is a wider
window than any real zone's offset (max ±14:00) and narrower than any pair of transitions.

**Evidence.** Cross-checked against the pinned Node (v26.7.0) in seven zones — `UTC`,
`Europe/Berlin`, `America/New_York`, `Australia/Lord_Howe`, `Asia/Kolkata`, `Pacific/Chatham`,
`America/Sao_Paulo` — over a probe covering both DST hemispheres, 30- and 45-minute offsets, a
no-DST control, pre-epoch instants, every month boundary, rollover in both directions and the
Invalid-Date recovery path. Byte-identical in all seven.

**Why `TZ=UTC` and not a zone that would exercise the difference.** A non-UTC pin would make the
golden fixtures actually distinguish local from UTC — but the compiled binary reads the tzdb through
libc and the Node ground truth reads it through ICU, and those two ship on independent schedules. A
tzdata skew between them would surface as a golden byte diff indistinguishable from a semantics bug.
Under UTC they cannot disagree. The cost is that goldens can only prove wiring and arithmetic, which
is why every zone-dependent claim moved to `tests/unit/date-local.test.ts` with an explicit `TZ` per
case, on dates whose rules have been fixed since 1996.

---

## 134. The §13 `typescript`-API tripwire, measured: not tripped — the cost at scale is ours (2026-09-01)

**Plan:** §13's first risk row arms a tripwire on the `typescript` API — *"checking >30% of compile
wall-time, or OOM on a 100k-line graph"* — whose response is program reuse and caching first, then
`oxc-parser` for parsing with the checker kept for types only, and a quarterly tsgo re-test recorded
here. §12 repeats it as a standing practice. This is that measurement, and it is the first one.

**Method.** A generated chain of `ts`-mode modules (N modules × 40 exported functions, each a typed
loop plus a branch; every function reachable from `main`, so DCE keeps the whole graph and clang
really compiles it). Each stage timed in-process around the same functions `src/cli/build.ts` calls,
then the whole `stator build` — node startup and clang included — timed around the CLI. Host: Apple
M3 Max, Darwin 25.6.0 arm64, Apple clang 21.0.0, Node v26.7.0, release runtime built against Boehm.
The harness stays out of the tree: it is a measurement, not a test.

| lines | createProgram | gate | lower | verify | emitC | front end | full build | `typescript` share |
|---|---|---|---|---|---|---|---|---|
| 11,350 | 262 ms | 39 ms | 126 ms | 190 ms | 18 ms | 0.65 s | 3.1 s | **13.6%** |
| 44,700 | 538 ms | 137 ms | 690 ms | 3.6 s | 209 ms | 5.2 s | 14.9 s | **9.2%** |
| 111,750 | 1.18 s | 342 ms | 2.95 s | 21.5 s | 158 ms | 26.2 s | 52.3 s | **8.5%** |

The share is `createProgram` + gate + lowering's checker queries over the full build's wall time.
Peak RSS at 111,750 lines was 856 MB, on the default heap — no OOM, no `--max-old-space-size`.

**Result: not tripped, and moving away from the wire.** The `typescript` API's share *falls* as the
graph grows, because everything that grows faster is ours. `oxc-parser` and tsgo stay parked; next
re-test due 2026-12. Note what a smaller, more natural corpus would have said: at 11k lines the
share is 13.6%, and on a corpus where most code is dead it read 58% — the number is meaningless
without a graph the backend actually compiles, which is why the fixture keeps every function live.

**What the measurement did find, in order of size.**

1. **`verifyHir` is quadratic in program size.** `verifyFunction` and `verifyBlock` each copy the
   entire enclosing scope (`new Map(bindings)`, `src/hir/verify.ts:587` and `:569`), so a module of
   M hoisted functions pays O(M) per scope entered, and every function body enters several. Measured
   190 ms → 3.6 s → 21.5 s across the three sizes: n^2.1 then n^1.9. At 111,750 lines it is 82% of
   the front end and 41% of the entire build — five times the whole `typescript` API. A parent-linked
   scope (lookup walks the chain; `set` writes to the innermost) removes the copy without changing
   what the verifier accepts. **Not done here** — it is a pass rewrite with its own Check, not a
   side effect of a measurement.
2. **One translation unit is half the build.** clang takes ~26 s of the 52 s at 111,750 lines, on a
   44 MB `.c`. That is §12's "split emitted C per module and compile in parallel" standing practice,
   now with a number attached rather than an assumption.
3. **A crash, fixed in this change.** At 111,750 lines the emitter died before clang ever ran:
   `RangeError: Maximum call stack size exceeded` at `src/codegen/index.ts:432` —
   `out.push(...functionLines, ...mainLines)` spreads the whole program's emitted lines into the
   argument list, which overflows somewhere between 45k and 112k input lines. It reached the user as
   a raw V8 stack trace, since `main()` rethrows anything that is not a `StatorError`/`BuildError`.
   Both program-scale spreads (`:432`, and `:485` per function unit) are loops now. Golden suite
   93/93 after the change, so the emitted bytes are unchanged.

**plan.md edited:** yes — §13's row records this measurement and its date, and §12 gains the
verifier finding as a standing practice with its numbers, since nothing in the ladder covered it.

---

## 135. Task 0.1's Check could only pass on the commit that closed it (2026-09-01)

**Plan:** §3 Task 0.1's Check read "`NICHE.md` exists with the three required elements; `git
describe --tags --exact-match HEAD` succeeds on its commit with tag `phase-0-approved`."

**Contradiction.** That command asks whether HEAD *is* the approval commit. It was, for exactly one
commit — `f5bdb0c`, tagged `phase-0-approved` — and has been false at every HEAD since. Five commits
later:

```
$ git describe --tags --exact-match HEAD
fatal: no tag exactly matches 'e27e118bf3fd763995e900d5bd41c6e564ab788c'
$ git rev-list --count phase-0-approved..HEAD
5
```

So the gate that §15.1 makes every later phase point at reported itself un-passed, permanently,
while the fact it was meant to establish — an owner-approved `NICHE.md` under a tag — had not
changed at all. Under golden rule 1 ("a task is done only when its Check passes") that is not a
cosmetic defect: re-running the Check is how a reader confirms Phase 0 without taking `done.md`'s
word for it, and `done.md` is explicitly not an authority.

**Fix.** The Check now asserts the durable fact instead of the position of HEAD:

```
$ git cat-file -e phase-0-approved:NICHE.md            # exit 0 — tag resolves AND carries the file
$ git log --diff-filter=A --format=%H phase-0-approved -- NICHE.md
f5bdb0c6da59ac746cfddf925a09bccae6adfe24              # == git rev-parse phase-0-approved^{commit}
```

One command proves what the gate is for (a tag named `phase-0-approved` whose commit carries the
approved `NICHE.md`); the second, kept as the stronger form, proves that commit is the one that
*added* the file rather than one that happened to inherit it. Neither mentions HEAD, so both answer
the same at any future HEAD, on any clone that has the tag.

**The general rule, added to §15 rule 2.** A Check must stay re-runnable at any later HEAD. An
assertion *about* HEAD — `--exact-match HEAD`, "the working tree is clean", a line number — is a
point-in-time observation, not a Check, and it converts finished work into work that reports itself
unfinished. Task 0.1 was the only Check in `plan.md` written that way (`grep -n HEAD plan.md done.md`
finds one other hit, §7 Task 4.7 step 1's "recount at execution HEAD", which is an instruction to
the executing agent, not an assertion).

**What was NOT changed.** The approval itself, `NICHE.md`, and the tag: the gate is closed and stays
closed, and nothing here re-decides it — that would need §15.4's bar and a human, per AGENTS.md.
The five gate steps stay in `plan.md` §3 for the reason both files already give: they are the gate's
definition, and §15.1 enforces itself by pointing at them.

**plan.md edited:** yes — §3's Check replaced (with the discarded form and why, kept as a warning),
and §15 rule 2 extended. `done.md`'s Phase 0 record now cites the re-verified output.

---

## 136. Task 4.7's inventory was 2.6× short, and 70 of the sites name a phase that closed on 2026-08-30 (2026-09-01)

**Plan:** §7 Task 4.7 says **63 call sites in `src/frontend/gate.ts` name phase 4** (audited at
`39cf053`, plan-notes 127), and its step 1 says to re-derive the inventory at execution HEAD rather
than assume it. This is that re-derivation, and it did not just move the number.

**Method.** The earlier counts were greps, which is why note 130 already had to defend the 63
against challengers whose single-line patterns missed multi-line `notYet(` calls. This one parses:
a `ts.createSourceFile` walk over `gate.ts` collecting every `CallExpression` whose callee is
`notYet` or `dateNotYet`, reporting each site's line, its second argument verbatim, and its
enclosing function. Same tool the compiler itself uses, so a multi-line call, a template-literal
message and a nested ternary all count exactly once.

**Result at `89de482`** — 165 sites, not 63:

| phase named | sites | what they are |
|---|---|---|
| **3** | **70** | the lowering ladder's residue — `ts`-mode static language surface |
| 4 | 63 | the audited group (builtin arity/spread/member catch-alls, module surface) |
| `dateNotYet` → 4 | 10 | the `Date` residue, hardcoded inside the helper |
| 5 | 18 | already re-homed by earlier slices |
| 8 | 2 | `with`, `eval` |
| 7 | 1 | `importing a package` |
| 6 | 1 | `destructuring in a for-of binding` |

**The finding is the first row.** Phase 3 is **COMPLETE (2026-08-30)** — `done.md` line 108, and
`plan.md` §6's heading. Seventy diagnostics name it as their deliverer. This is not a latent
mislabel; it is user-visible today:

```
$ node src/cli/main.ts build /tmp/rest.ts -o /tmp/rest
/tmp/rest.ts:1:12 STA1214 [ts] rest parameters are not yet supported; planned for Phase 3
```

`notYet(message, phase)` renders `${message}; planned for Phase ${phase}`, so every one of the 70 is
a shipped promise pointing at finished work. Exactly the defect Task 4.7 exists to end — and the
task would have closed without touching a single one of them.

**Root cause, and it is the same shape as note 116's.** Task 4.7 was written while Phase 4 was
closing, so it asked *"which sites name phase 4?"* — a question about the phase that happened to be
open. The rule the task itself establishes ("a not-yet names the phase that owns its **blocker**,
never the phase that happens to be open") implies the general question: *does any site name a phase
already complete?* Nobody asked it, because the audit inherited the framing of the moment. Phase 3
closed on 2026-08-30 and no sweep ran; Phases 1 and 2 closed earlier and, by luck, left no
pointers behind (a `notYet(…, 2)` search finds none — the walking-skeleton deferrals were rewritten
to 3 and 4 as the ladder advanced, which is the same sweep, done informally, that nobody repeated
for 3).

**How the 70 got there.** The ladder's rungs each landed a core and deferred its surface under
`notYet(…, 3)` *while Phase 3 was open* — rung 4 landed calls and deferred rest/default/optional/
destructuring parameters, rung 6 landed class layout and deferred accessors, statics, computed
names, `#private` collisions, overloads and override rules, and so on. Each was honest when
written. Phase 3's Check passed on the eight rungs it named, not on the surface they deferred, and
the residue outlived its owner.

**No phase owns them.** §1.1 promises *"Everything else that is typed TS should eventually compile
… Gaps on the way are 'not yet' diagnostics naming the phase that delivers them."* Phase 5 is `js`
mode plus the surface **Phase 4** deferred; 6 is conformance, 7 FFI, 8 the dynamic tier. The
`ts`-mode static surface Phase 3 deferred — rest parameters, destructuring, the class member
surface, generics beyond monomorphization, object-literal forms, bound method values — is
unscheduled, in the mode that is the product's default.

**plan.md edited:** yes, in this change.
- §7 Task 4.7: the inventory paragraph now carries the parsed 165 and its distribution, step 1
  gains the general question (*any* completed phase, not phase 4), and a new group is added to
  step 6 for the ladder residue.
- §8 Phase 5: **step 12** added — "the lowering ladder's residue" — owning the static-TS surface,
  grouped by construct family, with its own Check. This follows Task 4.7 step 6's own instruction
  ("EDIT §8/§11 in the same change to give it one"); it is deliberately NOT a new phase, because
  §15.3 forbids renumbering (`plan.md §N Task X.Y` is cited from code comments and `docs/`).
  Phase 5's preamble already warns that steps 8–11 becoming a bucket is the signal to split; step
  12 makes that warning live, so the preamble now names the split trigger explicitly instead of
  leaving it to feel.

**Also observed, not fixed here:** `plan-notes.md` has a **third** numbering collision — two
entries numbered `133` (lines 3273 and 3323, both 2026-09-01). Note 115 set the handling: renumber
the newer entry, never retroactively renumber a note others may cite. Both 133s predate this entry
and both are already cited, so neither is safe to move by the rule that produced the rule; recorded
here so the next collision is the fourth, not a surprise.

## 138. LLVM clang is a mise pin, not a system package (2026-09-01)

**Context.** `mise.toml` already pinned Node and pnpm. clang was "whatever Xcode CLT / apt
shipped", which is what `docs/TOOLCHAIN.md` recorded as an unversioned `C compiler` row.

**Decision.** Pin LLVM **21.1.8** in `mise.toml` as `conda:llvm` + `conda:clang`, Unix-only.
Conda is the prebuilt backend: the asdf `mise-llvm` plugin downloads the llvm-project tarball
and compiles it with ninja, which is not a toolchain pin. Windows is out because the runtime
Makefile is not a Windows toolchain (plan-notes 122) and those backends are bash/conda, not a
MSVC story. `make`/`ar`/`pkg-config`/`diff` stay system packages; they are not the compiler.

`STA0008` now names `mise install` first. CI still uses the runner's clang (plus `apt install
clang llvm` on Linux next to libgc-dev) — a version pin on GitHub-hosted images is a different
change from making `mise install` the local bootstrap.

**plan.md edited:** no. The C11/clang requirement did not change.

## 139. Architecture diagrams switch from Mermaid to D2 (2026-09-01)

**Request.** Owner asked for D2 as the modern diagram of how the compiler works, and for
`AGENTS.md` to tell agents about it.

**What landed.** `docs/architecture/*.d2` is the source (pipeline, build sequence, packages,
value-flow — the same four views plan-notes 126 put in Mermaid). SVGs next to them are the
GitHub-visible render (`d2` v0.8.2). `docs/ARCHITECTURE.md` is the gallery. Mermaid is gone
from that file: GitHub does not render D2 natively, so the committed SVG is the display path.
`d2` is a docs tool (`brew install d2`), not a compile pin and not in CI.

`plan.md` §2 now names D2 instead of Mermaid; repo layout lists `architecture/*.d2`.
`AGENTS.md` gained an "Architecture diagrams (for agents)" section so agents read the `.d2`
files rather than inventing a fifth view.

Same subordination as 126: diagrams visualize §2, they never override it.

## 140. The `inferred` provenance grade was already landed, and the plan asked for it in the wrong words (2026-09-01)

**Context.** Phase 5 step 1's only remaining item, per its own text: *"the `inferred` middle grade
— today lowering grades only typed-vs-dynamic; a `.js` function whose signature the checker
recovered (JSDoc or inference) must report `inferred`."*

**Finding 1: it was landed before the sentence was written.** `provenanceOf`
(`src/lower/index.ts`) has returned all three grades since `5e9f2b4` (2026-08-31); the step-1
detail that calls it remaining was written on 2026-09-01 (plan-notes 131, v2.7), a day later.
Live, at this HEAD:

```
$ node src/cli/main.ts explain grades.ts --json
{"verdict":"static","functions":[
  {"name":"whole","line":1,"provenance":"typed","verdict":"static"},
  {"name":"halfWritten","line":2,"provenance":"inferred","verdict":"static"}]}
$ node src/cli/main.ts explain grades.js --mode=js --json
{"verdict":"dynamic","functions":[
  {"name":"whole","line":5,"provenance":"typed","verdict":"static"},
  {"name":"halfWritten","line":7,"provenance":"inferred","verdict":"static"},
  {"name":"none","line":8,"provenance":"dynamic","verdict":"dynamic"}]}
```

Plan-notes 131's method — write the steps against the live tree — is the right one; it read
`explain`'s printer and `program.ts`, saw the substrate, and did not read `provenanceOf`. The
lesson is 136's again at a smaller scale: a step that says "already landed: A, B, C — remaining:
D" has to check D against the tree with the same care it checked A, B and C.

**Finding 2: the plan and the tree disagree on what `inferred` MEANS, and they are inverted.**
Step 1 and step 6 both grade a JSDoc-annotated `.js` function `inferred`; the tree grades it
`typed`, on the ground that `@param {number} x` is the same claim by the same author as
`x: number`. Worse, the two readings put the trust axis in opposite directions: step 5 says
"`typed` callers trust, `inferred`/`dynamic` sources get checks", while the landed test comment
says "an annotation is a claim a boundary must check, an inference is derived from the code and is
already sound". One field, two contradictory meanings, and step 5 was about to be keyed on it.

**Finding 3, the measurement that settles it.** Step 5's premise — a lying JSDoc produces a
located RUNTIME type error — does not hold. `program.ts` sets `checkJs: mode === 'js'` and
surfaces every `ts.getPreEmitDiagnostics` entry as a fatal `STA0012`, so the lie never reaches a
runtime check:

```
$ cat math.js
/** @param {number} x @returns {number} */
export function double(x) { return x * 2; }
$ cat main.ts
import { double } from "./math.js";
const result: number = double("5");
$ node src/cli/main.ts build main.ts -o app --mode=js
main.ts:2:31 STA0012 [js] Argument of type 'string' is not assignable to parameter of type 'number'.
```

A JSDoc that contradicts its own body fails the same way. So a JSDoc is not an unverified claim in
this compiler — `checkJs` verifies it, and the gate makes the verdict fatal. What DOES survive to
runtime is a dynamic argument reaching an annotated signature (a value from `JSON.parse`, from an
un-annotated `.js` export, later from FFI). That is a property of the EDGE, and no per-function
grade can express it.

**Decision: keep the tree's semantics.** `typed` = the author annotated the signature whole, in
either spelling; `inferred` = the checker finished it; `dynamic` = an `Unknown` is in it, which
outranks both. Three reasons: it answers the question the field's name asks; it is strictly more
informative, since the `.ts`/`.js` split the plan wanted is already in the report's own file path;
and collapsing JSDoc to `inferred` would erase the annotated/un-annotated split INSIDE `.js`,
which is the only split js mode trades on. Note that within `.ts` the `typed`/`inferred` line
carries no trust difference at all — `strict` verifies both — which is the clearest sign that
provenance was never the right key for boundary insertion.

**plan.md edited** (same change, §15 rule 6):

- §8 step 1: struck through and marked landed, with the commit and the test; the JSDoc clause
  corrected, and the reason it was wrong recorded in the step itself so the next reader does not
  re-derive it.
- §8 step 5: the provenance key removed and replaced by the measurement above, with the edge named
  as the actual key. Its proof shape is corrected too: the trap fixture cannot be a lying JSDoc,
  because that program no longer reaches runtime.
- §8 step 6: provenance `inferred` → `typed`; the per-function half is landed, the file-level claim
  and its golden are what remain.

**Also fixed, in the same change:**

- `docs/MODES.md` §4 Example 1 asserted that `double("5")` against a `@param {number}` "type-checks
  (JSDoc says number)" and is caught by an emitted runtime check. It does not type-check, and no
  future work makes it — `tsc` reads the JSDoc, so the call is statically wrong. The example is
  rewritten to a lie `tsc` cannot see, which is what a boundary check is actually for.
- `docs/HIR.md`'s `FunctionExpr` bullet gained `provenance`. `provenanceOf`'s doc comment has cited
  `docs/HIR.md` since `5e9f2b4` and the field was never described there.

**Not fixed here:** `MODES.md` §4's other two examples describe boundary checks that are step 5's
to make true; they are not wrong in the way Example 1 was, so they stay as written.

## 141. Three mode-table codes were allocated and dead, for three different reasons (2026-09-02)

**Context.** Phase 5 step 2: switch the diagnostic table by mode. (a) `any`/`as any` in js mode
stops being `STA1001`; (b) `var` legal in js only; (c) a `.js` entry under ts is `STA1002` with
"use `--mode=js`"; (d) `eval`/`new Function` in js emit **`STA1206`**, which DIAGNOSTICS.md had
allocated and src/ emitted nowhere.

**Finding 1: `STA1002` could not fire.** `src/frontend/program.ts` set `allowJs: mode === 'js'`.
Under ts mode, tsc **drops** a `.js` root file; `getSourceFiles()` never contains it, so the
gate's `fileName.endsWith('.js')` arm is unreachable. `build` reports `programDiagnostics`
before the gate, so the user saw `STA0012` "enable the 'allowJs' option" — the wrong code and
the wrong flag. `allowJs` is now on in both modes; `checkJs` stays js-only. The gate is what
refuses the file.

**Finding 2: the eval check was dead for the opposite reason.** It fired only when
`getSymbolAtLocation(eval) === undefined`. `eval` has a lib.es5 declaration, so the check
accepted and `gateIdentifier`'s global catch-all reported `STA1214` "the global 'eval'",
Phase 5. Same for `new Function` ("new on this type") and `Function(...)`. Dedicated codes
`STA1101`/`STA1103`/`STA1206` existed and were unreachable. The identifier is now recognized
the way `Date` is (declaration-file test), including `globalThis.eval` and aliasing
(`const e = eval`).

**Finding 3: `as any` was classified as implicit.** `const x = 1 as any` has no annotation on
the BINDING, so `isImplicitAny` fired `STA1003` first; the AsExpression child also fired
`STA1001`; `classify` picks the first never. The author wrote `any`. `isImplicitAny` now skips
an initializer that is `as any` / `<any>x`.

**(b) was already true.** `var` is `STA1104` never in ts and `STA1214` not-yet in js. Step 2
asked only that the split exist; the lowering is step 3, and `subset_var_declarations_js.js`
stays expected-fail at `@verdict: static`.

**Out of scope, recorded so it is not "fixed" by accident.** Indirect eval `(0, eval)("x")`
is still "calling an arbitrary expression" (`STA1214`). A comma-expression callee is not the
identifier `eval`, and teaching the gate to see through it is a different check than the
mode table.

**plan.md edited:** yes, §8 step 2 struck through; Phase 8 item 5 no longer claims `STA1206`
has never been emitted.


## 142. `var` desugars to a hoisted `let`; checkJs still rejects the classic use-before-decl spelling (2026-09-02)

Phase 5 step 3. js mode now accepts `var`. The HIR did not grow a third `declKind`.

**Desugaring.** Each `var` name is collected from the function (or module), skipping nested
functions. Names not already bound (a parameter or a function declaration) become a `let`
initialized `undefined` at the top of that unit. The original site is an assignment if it has
an initializer, and a no-op otherwise. A second `var` of the same name is a second write to
the same slot — that is the spec's Instantiation, not a second Declaration node.

**Why no `declKind: 'var'`.** The runtime difference from `let` is *where the slot lives and
when it is initialized*, not how it is stored. Putting that in the lowering keeps every pass
that already understands `let`/`assignment` honest, and stops a later pass inventing a second
TDZ.

**Loop capture.** `gateIdentifier` used to refuse any capture whose declaration AST sat inside
a loop. For `var` that is the wrong scope: the binding is function-scoped, so capturing it is
the ordinary shared-binding case env capture already implements. The refusal now applies only
to `let`/`const` (per-iteration bindings, still Phase 5 step 12 / the capture-in-loop row).

**checkJs vs the classic spelling.** `console.log(x); var x = 1` is legal JS and the lowering
desugars it (pinned by `tests/unit/var.test.ts`, which does not run the tsc diagnostic
surface). `program.ts` still forwards every checkJs diagnostic as `STA0012`, and checkJs under
`strict` reports "Variable 'x' is used before being assigned" for that spelling. Dropping that
one tsc code would be a policy change this step does not own. The golden therefore proves the
runtime fact with the equivalent form checkJs accepts: `var x; console.log(x); x = 1`. Same
slot, same `undefined`, no TDZ.

**Parameter shadow.** `function f(x) { var x = 2 }` is one slot. checkJs also rejects
`var x = 2` against an untyped parameter (`any` vs `number`); the golden uses `var x; x = 2`
so the subsequent declaration has no initializer type to disagree with.

**Biome.** `docs/architecture/` (generated D2 SVGs) is excluded from `biome.json`. The a11y
`noSvgWithoutTitle` rule fires on every generated rectangle; those files are diagrams, not UI.

**plan.md edited:** yes, §8 step 3 struck through.


## 143. Empty `{}` is dynamic; STA2004 shrinks to grow-only; STA4058 retires (2026-09-02)

Phase 5 step 4. The runtime half (shape table + ICs) existed; the lowering did not target
Unknown receivers, and the shape-table entry points panicked on anything that was not a
`JSRTDynObject`.

**Empty `{}`.** `isDynamicShape` now includes zero-property anonymous types, and
`shapeTypeToHType` returns null for them, so they are Unknown in HIR rather than a layout
with no slots. An all-required anonymous shape *with at least one field* stays fixed —
making those dynamic would deoptimize every literal. Growing therefore works for
`let o = {}; o.x = 1` and not for `let o = { x: 1 }; o.y = 2` (STA2004).

**STA2004.** The aliased-read honesty clause is lifted: `jsrt_get_prop` walks the class
descriptor for a fixed object, so `const a = { x: 1 }; const b: { x?: number } = a; b.x`
prints `1`. Growing a key the descriptor does not list still cannot invent a slot, and
that is the remaining STA2004 (Phase 8, dictionary mode).

**STA4058 retired.** Nullish → TypeError; string `"length"` → length; other primitives →
`undefined` on get / TypeError on set; arrays share the property table they already had
for match-array fields.

**Call convention.** `jsrt_call_at` names `file:line` (`STA2006`). Column is not on `Span`
(the BoundaryCheck `where` rationale). `this` is not argv[0] for ordinary functions: the
gate still forbids `this` outside class members, so prepending the receiver would break
every non-method. Arity padding was already `jsrt_arg`.

**js-only 2339/2551/2353.** checkJs reports "property does not exist" for untyped `o.x = 1`.
Those three codes are skipped in js mode only, so the shape table can answer at run time.
ts mode still surfaces them as `STA0012`.

**`==`.** Already `jsrt_loose_equals` with ToPrimitive (NUMERIC.md §6.3.1);
`tests/golden/js/to-primitive.js` pins the table. Not re-derived here.

**plan.md edited:** yes, §8 step 4 struck through.

**JSON.parse `data.x`.** `subset_json_parse_boundary_js.js` flipped: the parse result is
Unknown, so `data.x` is now a shape-table read rather than a not-yet. The ts counterpart
stays expected-fail (`any` return is STA1001).

**Empty `{}` as an argument.** Contextual type `any` is not a shape, so the gate used to
refuse `f({})` as "shape is not a layout" after empty objects stopped being a zero-field
layout. `objectLiteralIsDynamic` falls back to the literal's own type.

**Computed-index ICs.** An inline cache is "same shape implies same offset" for a key *fixed at
the site* (`o.x`). `o[k]` reuses one site for many keys, so a shape-only hit would return the
wrong slot (the golden's `get(o, 'missing')` answered `1` after `get(o, 'x')`). Dyn-index
passes `NULL` for the cache.

**Match arrays.** `m.length` is a match-read, and match receivers are Unknown, so the new
dyn-field arm stole it and `jsrt_get_prop` walked the property table, missing `length`. The
match-read arm is restored (skip match receivers in dyn-field), and `jsrt_get_prop` answers
array `"length"` for Unknown array receivers.

## 145. Code coverage uses Node's test runner, not c8 (2026-09-02)

`pnpm run test:coverage` is `--experimental-test-coverage` scoped to `src/**`, with
`--test-coverage-include-all` so a file the suite never loads counts as 0% rather than
vanishing from the report. The lcov output is `coverage/lcov.info`. No new dependency —
the budget is still `typescript` only; Node 26 already prints the table and emits lcov.

CI: the linux/x64 frontend job is the one that builds the runtime and therefore exercises
the native-only unit tests, so it owns the report. Other frontend platforms keep
`pnpm run test`. `pnpm run ci` uses the coverage run in place of the plain one.

C runtime coverage (llvm-cov) is a different toolchain and is not this change. Thresholds
are not gated: the first measured numbers (unit tests over `src/`) were about 91% lines /
87% branches / 95% functions, and a floor is a later policy call.

**plan.md edited:** no.

## 144. Mixed-graph checks wrap the edge; a typed-looking lie is a compile error (2026-09-02)

Phase 5 step 5. Three things the plan's proof-shape paragraph got slightly wrong, measured rather
than re-litigated:

1. **The trap cannot be a function whose body checkJs can type.** `export function factorFrom(n) {
   return String(n); }` assigned to `const factor: number` is `STA0012` "Type 'string' is not
   assignable to type 'number'" — the same compile-error path plan-notes 140 already recorded for a
   lying JSDoc. The value that reaches runtime is an *untyped* identity, `function wrap(x) { return
   x; }`, whose return is `any` and therefore Unknown. `wrap("10")` into a `number` slot is the
   trap; `wrap(10)` into the same slot is the happy path.

2. **Expected-stderr on the golden harness was not added.** STA2004 and STA2006 already pin runtime
   aborts as CLI native tests (`NATIVE_ONLY`, empty stdout, code in stderr). A second harness mode
   whose only client would be this one trap is duplication. The happy-path mixed graph is an
   ordinary vs-Node golden; the trap is `tests/unit/cli.test.ts`.

3. **`docs/MODES.md` §4 Examples 2 and 3 were false.** Example 2 assigned an inferred `number`
   (`MAX_RETRIES = 3`) to `string` and called that a runtime check; it is `STA0012`. Example 3
   assigned `unknown[]` to `number[]` and promised per-element checks; `number[]` is not
   `isCheckable`, so the assignment is not wrapped and element reads stay dynamic until a checkable
   narrowing at the use. Both examples rewritten.

The wrap itself is `maybeBoundary` in `src/lower/index.ts`: Unknown value + checkable expected type
→ `BoundaryCheck`. Call arguments use the callee's HIR `fn` parameter types, so builtins that lower
to their own nodes (`Math.abs`, `JSON.parse`) are not wrapped by this path — they already have a
typed lowering of their own.

## 146. js-column expected-fail was stale for landed operators; `var xs = []` was STA4004 (2026-09-02)

Phase 5 step 7. Note 145 is the coverage runner from a parallel change the same day; this is the
step 7 record.

The plan's "64 fixture files" was already stale (32 js files after steps 2–4). Of those, twelve
were constructs that compiled today and had never had their marker removed:

- Typed *literals* (`5 + 3`, `5 & 3`, `` `Hello ${name}` ``, `switch (2)`, `const x = 42`) are
  **static**, not the `dynamic` the fixtures claimed. The js column is dynamic for *untyped
  operands*; these fixtures never had any.
- `function test(x) { if (x > 0) ... }` is **dynamic** because `x` is untyped — the fixture said
  `static`.
- `null ?? 0` is STA0012 (checkJs rejects a literal `??`); `function coalesce(x) { return x ?? 0; }`
  is the js-column case and is dynamic.

The rest stay expected-fail because the construct is not landed (`**`, rest, destructure, `for-in`,
`import()`, generators, …) or the allocated never-code is not the one emitted (`@dec` is STA1214
not STA1112). Those flip in their owner step, not here.

`var xs = []` (and `var hits = search()` returning an array) was an internal STA4004:
`hTypeAssignable` treated `unknown[]` as an array, so the Unknown-on-either-side clause did not
fire, and `hTypeEquals` then rejected two `unknown[]` that differed only in `fromImplicitAny` —
exactly the split the `var` hoist introduces. Recursing into array elements is the same rule the
Unknown clause already stated.

The capstone is `tests/golden/js/capstone.js`, an untyped catalog: growing empty objects, computed
index, Unknown call, `==`, `var` on scalars.

## 147. `for-of` over a string is a counted loop of code points, not units (2026-09-02)

Phase 5 step 8, first code slice after the §4.13 representation. `String.prototype[@@iterator]`
yields code points: `"a👍b"` is three iterations, and the middle value has `.length === 2`. The
loop calls `jsrt_string_iter_next`, which advances the UTF-16 cursor by 1 or 2. Map/Set/user
iterables, `keys`/`values`/`entries`, `matchAll`, and `function*` are still open under this step.

The gate test that used `for (const c of 'ab')` as the non-array STA1214 witness now uses a `Map`.

## 148. `for-of` over Map and Set is a live insertion-order walk (2026-09-02)

Phase 5 step 8, after string for-of. No protocol object: the emitter writes `jsrt_map_iter_begin` /
`jsrt_map_iter_next` / `jsrt_map_iter_end` (Set shares the table and has `jsrt_set_iter_next`).
The walk re-reads `used` so a body that `set`/`add`s is visited, and skips `!live` so a deletion
of a not-yet-reached entry is not. `iterating` is the same compaction-suppression counter
`forEach` uses; a throw or return from the body runs `iter_end` through a codegen finally so
the count cannot leak.

A Map yields a two-element array. The HIR has no tuple, so the binding is Unknown and a ts-mode
file that uses the pair is dynamic even when K and V are typed. A Set yields the element type,
so a typed Set for-of stays static.

Remaining under this step: the nine `keys`/`values`/`entries` members, `matchAll`, `function*`,
and `for-of` over a user iterable.

## 149. Runtime build is a justfile, not a Makefile (2026-09-02)

`runtime/Makefile` is gone. The recipes live in a repo-root `justfile`: `just runtime`,
`just runtime-asan`, `just runtime-intl`, `just runtime-test`, `just runtime-test-asan`,
`just runtime-clean`. Incrementality is a timestamp walk of each `.c` and the `-MMD` sidecar
the compiler writes, so a header change still rebuilds (plan-notes 66). `CC` from the
environment still wins; unset, it is clang.

`just` is pinned at 1.58.0 in `mise.toml`. CI installs it via `extractions/setup-just@v3`
on every job that builds the archive (frontend Unix, runtime, asan, intl). Windows frontend
never builds the runtime.

Live diagnostics (STA0011, STA1210, STA1215) and live comments name the recipes. Historical
`plan-notes.md` / `done.md` evidence of `make -C runtime` stays as written.

## 150. Array/Map/Set `keys`/`values`/`entries` (2026-09-02)

Phase 5 step 8. When the call is the operand of a `for-of`, the emitter inlines the specialized
walk (`view` on the for-of node) and allocates nothing. When the call is stored
(`const it = arr.keys()`), the runtime boxes a `JSRTIterator` — a cursor plus a kind tag, not a
`next` closure — and `it.next()` is `jsrt_iterator_next`, answering `{ value, done }` as a nameless
dynamic object. for-of over a stored iterator is `jsrt_iterator_step`.

Map `for-of` / `entries()` still yield a two-element array, so a ts-mode file that uses the pair
is dynamic (no tuple). Array `keys()` yields numbers and stays static; Set `keys()`/`values()`
yield the element.

User iterables and `matchAll` / `function*` remain open under this step.

## 151. `String.prototype.matchAll` (2026-09-02)

Phase 5 step 8. `matchAll` is a boxed specialized iterator (`JSRT_ITER_MATCH_ALL`): the
runtime clones the `/g` regexp so walking cannot mutate the original `lastIndex`, each
`next()`/`for-of` step is `RegExpBuiltinExec` yielding a match array, and an empty match
still AdvanceStringIndex so the walk cannot spin. A non-global pattern is STA2005 (the
spec's TypeError); a non-regexp argument stays `STA1214` (RegExpCreate).

Remaining under this step: `function*`, and `for-of` over a user iterable.

## 152. `function*` / `yield` (2026-09-02)

Phase 5 step 8. A generator is a `JSRTGenerator`, not a tagged `JSRTIterator`: the cursor is a
resume point and the locals live in a heap environment. `gen()` only allocates; the body runs
on the first `next()`. `yield e` parks `e` and pops the C frame; a later `next(v)` is the
value of that yield. `for-of` uses `jsrt_iterator_step` and discards the completion value.
Uncaught throws stay pending for the call site of `next()`; the object is marked done so a
later `next()` does not re-enter.

`next(v)` lands. Generator methods, async generators, and `for await` stay **STA1201**.
`yield*` is STA1214. `.return()` / `.throw()` on the generator object stay not-yet.

Remaining under this step: `for-of` over a user iterable (needs `Symbol` as a value).

## 153. Generator `.return()` / `.throw()`, and the suspension-state fix they exposed (2026-09-02)

Phase 5 step 8. The closing pair lands as an INJECTION, not a value: `jsrt_generator_close` /
`jsrt_generator_throw` set `inject` on the `JSRTGenerator` and resume the parked label, where the
generated prologue reads and clears the mode. THROW rethrows at the yield's own landing pad (the
body's `try`/`catch` cannot tell it from a `yield` that threw); RETURN parks the value in the
return slot and runs the ordinary return routing, so every enclosing `finally` runs and a finally
that yields suspends again with the completion value already parked. Unstarted and completed
generators share GeneratorResumeAbrupt's (ECMA-262 27.5.1.3) one answer without entering the
body: `return(v)` answers `{ value: v, done: true }` — the NEW value, which the in-flight draft
got wrong on the completed branch — and `throw(e)` rethrows to the caller.

The gate admits the two only on a receiver the checker types as the declaration-file `Generator`
(`isGeneratorReceiver`): a boxed specialized iterator's `IterableIterator` type SPELLS the names
the object does not carry, and Node answers a TypeError there the runtime cannot raise yet —
that case stays not-yet (`Iterator.return on a specialized iterator`, Phase 5). The lowering's
defensive branch and the runtime's class guard share the new internal **STA4071**.

The finally-yield golden exposed a pre-existing hole: NO compiler-introduced C local survives a
suspension, because the resume `goto` jumps over its initializer and the frame it sat in was
popped. `yield` inside a `for (const x of arr)` looped forever on main; `return` through a
finally that itself awaits/yields read an indeterminate completion code. Two fixes, one rule
(the invariant the await emitter already stated: every local lives in the environment):

- The try/finally completion code is now a counted SLOT, boxed with `jsrt_number` — sync units
  get a `JSRT_LOCAL`, suspendable units an env slot, one code path for both. The exception stash
  was already a slot for the same reason; counting now claims the pair adjacently.
- A suspendable unit boxes EVERY specialized for-of (array, string, Map, Set) into a heap
  `JSRTIterator` — the same object a stored `arr.values()` drives — so the cursor survives.
  Strings gained `JSRT_ITER_STRING` (10) for this; the `JSRT_ITER_*` numbering is now named once
  in `ITER_KINDS` (src/codegen/index.ts) instead of twice as arithmetic. Sync units keep the
  zero-alloc inlined loops and the raw-int map cleanup completion.

Goldens: `tests/golden/{ts,js}/generator_close.*` (the eight-case edge matrix, byte-for-byte vs
Node), `tests/golden/ts/generator_loops.ts` (yield inside every specialized for-of, break/return
routing), and a `finAwait` case in `tests/golden/ts/async_await.ts`. Decision fixtures
`tests/subset/subset_generator_close_{ts,js}` pin the verdicts — dynamic in both modes, because
IteratorResult is an interface the HIR does not layout, which is also why no static fixture
calls `.next()`.

Remaining under step 8: `for-of` over a user iterable (needs `Symbol` as a value, STA1212).

## 154. User-iterable `for-of` is a compile-time method, not a Symbol primitive (2026-09-02)

Phase 5 step 8's remaining line said user-iterable `for-of` "needs `Symbol` as a value". Tags in
`docs/VALUE.md` §1 are fully allocated; Map/Date/Generator are Object-tagged plus a class pointer,
so a new Symbol NaN-box tag was never the path.

What landed: a class instance method `[Symbol.iterator]()` whose return type is already HIR
`iterator` (a Generator, or a boxed specialized iterator). Lowering wraps the `for-of` iterable
in a MethodCall of that method; the existing boxed-iterator walk drives the result. `Symbol.iterator`
as a *stored value*, `Symbol("id")`, and `Symbol.for` stay `STA1212`. Generator methods
(`*[Symbol.iterator]()`, `*m()`), async generators, and `for await` stay `STA1201`. `yield*`
and a custom `{next()}` object (not a Generator) stay `STA1214`.

TypeScript unique-ifies well-known symbol properties as `__@iterator@<id>` (the suffix is
per-program; do not hardcode it). `userIteratorMethod` looked up `__@iterator` and missed, so
the gate still emitted STA1214 for a class the checker could see. `hirPropertyName` canonicalizes
that spelling in `classTypeToHType` so the MethodCall slot, the vtable row, and the lookup agree.

Check: `tests/golden/ts/user_iterable.ts` and `tests/golden/js/user_iterable.js` match Node;
decision tests `subset_user_iterable_{ts,js}`; `subset_symbol_primitive_{ts,js}` dropped
`@expected-fail` and keep `STA1212`; unit test admits the class method and still rejects
`Symbol("id")` and `Iterable<number>`.

## 155. Top-level await is an async module unit; init stays topological (2026-09-02)

Phase 5 step 9 required an ordering decision before code. Node's ESM loader interleaves sibling
subgraphs: two modules that do not import each other both run their prefix, hit `await`, and
continue in registration order. Measured:

- `a` has TLA, sibling `b` does not: Node prints `a-start, b, a-end, main`
- both siblings have TLA: Node prints `sa-start, sb-start, sa-end, sb-end, siblings-main`

Stator merges the program into one module in Task 3.11's topological order and evaluates that body
as a single unit. There are no per-file init functions to schedule. Mirroring Node would invent a
scheduler the whole-program model does not have. Decision: **topological, not Node's interleaving**.
The difference is observable only among siblings; a linear import chain matches Node. Recorded in
`docs/MODES.md`.

Implementation: a top-level `await` marks `Module.isAsync`. The emitter keeps named bindings in
the globals array and puts temps/await-state in a heap environment so a suspension cannot drop
them. `main` roots the init promise, subscribes a completion that turns a rejection into
`jsrt_uncaught`, and drains the microtask queue. `STA1208` is no longer emitted (the code stays
allocated). Await in a non-async function remains `STA1214`.

Check: `tests/golden/{ts,js}/top_level_await.ts` match Node (`before / 42 / after`); decision
tests `subset_top_level_await_{ts,js}` are `static`; gate unit test admits top-level await and
still refuses `await` in a non-async function.

## 156. Literal `import()` is a namespace object plus `Promise.resolve` (2026-09-02)

Phase 5 step 10. A module namespace is not a new NaN-box tag: it is an `HObject` with
`namespace: true` whose fields ARE the target file's export list. Field reads compile to the
export's global slot, so `ns.x` and the binding are the same cell. The object value is a dummy
literal of those identifiers, enough for `import()` to put something in a Promise; identity,
printing, and `Object.keys` are not the spec's Module exotic object.

Literal `import("./m.ts")` is accepted by the gate, recorded as a value-import edge (so `m`'s
top-level has already run in Task 3.11 order), and lowers to `Promise.resolve` of that dummy.
`typeof import("m")` maps through `moduleNamespaceToHType` so `m.n` is a FieldAccess, not a
dynamic get. A computed specifier stays `STA1207` (Phase 8). `STA1207` remains allocated.

TypeScript puts Module bits on a fresh `let o = {}` binding (ValueModule|NamespaceModule plus BlockScopedVariable). `moduleNamespaceToHType` therefore also requires that the symbol is not a Variable and that its declaration is a SourceFile or module declaration; without that, `{ x: number }` was marked `namespace: true` and `o.x = 1` was STA1214.

A live-binding golden that mutates an export through `m.setK(2)` needs calling an exported
function as a namespace method; this landing proves `m.n` and the init-edge, not that call shape.

Check: `tests/golden/{ts,js}/dynamic_import/main.ts` match Node (`42`); decision tests
`subset_dynamic_import_{ts,js}` are `static`; `subset_dynamic_import_computed_{ts,js}` stay
`STA1207`; gate unit admits a literal specifier and refuses a computed one.

## 157. `jsrt_call_protected` is the §4.9 mailbox used by a builtin (2026-09-02)

Phase 5 step 11. The missing piece `STA1216` named was never a second exception protocol: generated
C already checks `jsrt_pending()` after `jsrt_call` and jumps to a landing pad. A builtin cannot
jump to a pad it does not have. `jsrt_call_protected` is that same call plus take-on-pending, and
yields a `JSRTCompletion { value, threw }` so `then`/`catch`/`finally` and `new Promise(executor)`
can settle a promise with a handler throw instead of unwinding into library C. Documented as a
subsection of `docs/VALUE.md` §4.9.

Unlock in the same change: `Object.freeze`/`isFrozen` (a frozen bit; writes throw TypeError;
generated C checks pending after `jsrt_object_set` / `jsrt_set_prop`) and `toISOString` on an
Invalid Date (RangeError, pending check after the date-op). JSON/RegExp/string STA2005 panics are
re-dated rather than converted: the mechanism exists, each abort is its own golden-churn follow-up.
`seal`/`isSealed` still need a distinct [[Sealed]] bit.

Combinator residue: `allSettled`/`any`/`race`/`withResolvers`/`try` stay not-yet (`Promise.${name}`
from the static table miss). They need only this mechanism plus, for a non-array argument, step 8.

Check: `tests/golden/{ts,js}/promise_then.ts` match Node (`2 / x / f / 2 / 3 / boom / nope`);
`object_freeze.ts` and `date_invalid_iso.ts` match; decision tests `subset_promise_then_*` and
`subset_object_freeze_*` are `static`; gate unit admits then/catch/finally, `new Promise`, freeze.

## 158. Rest parameters are packed at the callee (2026-09-02)

Phase 5 step 12 family (a), first member. Call sites already pass extra arguments through
`jsrt_call`; a rest parameter is the callee packing `argv[from..]` into an array
(`jsrt_args_rest`). An empty rest is a fresh empty array, not `undefined`. Closure arity
(`Function.length`) excludes the rest parameter. Destructuring rest, defaults, optional
parameters, and destructuring declarations remain open in the same family.

Check: `tests/golden/{ts,js}/rest_params.ts` match Node (`6` / `10`); decision tests
`subset_rest_parameters_{ts,js}` out of expected-fail (static / dynamic).

## 159. Default and optional parameters (2026-09-02)

Phase 5 step 12 family (a), after rest. A default is an expression on the HIR `Parameter`; codegen
loads `jsrt_arg` and, when the value is `undefined`, evaluates the default into the same slot.
Optional `x?` is a missing argument with no initializer — `jsrt_arg` already yields `undefined`.
`Function.length` (`declaredArity`) stops at the first rest or default and still counts a bare
optional. Destructuring parameters, destructuring declarations, uninitialized `let`, and catch
destructuring remain open in the same family.

Check: `tests/golden/{ts,js}/default_params.*` and `optional_params.*` match Node; decision tests
`subset_default_parameters_{ts,js}` and `subset_optional_parameters_{ts,js}` (no expected-fail).

## 160. Uninitialized `let x;` is a slot that starts undefined (2026-09-02)

Phase 5 step 12 family (a). `Declaration.value` is optional; codegen writes nothing and the frame
slot is already `undefined`. TypeScript still rejects a typed read before a write (`STA0012`).

## 161. Shallow destructuring desugars to field and index reads (2026-09-02)

Phase 5 step 12 family (a). `const { x, y } = p` and `const [a, b] = arr` become one declaration
per name, plus an unspellable temporary when the RHS is not already an identifier. A `flatten`
block leaks those bindings to the enclosing statement list (a nested Block is a scope). Parameters
and `catch ({ message })` unpack the same way after a synthetic slot. Nested patterns, rest in a
pattern, and pattern defaults stay not-yet. A typed `catch ({ message })` is a TypeScript error
(`unknown` has no properties); js-mode catch destructure matches Node.

Check: `tests/golden/{ts,js}/destructure.*` match Node; object/array destructuring decision tests
out of expected-fail.

## 162. Release archives are thin-LTO bitcode when the linker can read them (2026-09-02)

The runtime's NaN-box accessors are `static inline` in `jsrt_value.h` and already inline into the
generated C, but every builtin call (`jsrt_array_push`, `jsrt_map_get`, string concat, shape
lookups) crossed the archive boundary as an out-of-line call. `just runtime` now probes
`-flto=thin` end to end (compile → `$AR` → link a bitcode archive) and, where it works, compiles
`build/` and `build-intl/` as bitcode and records the flag in `link-flags.txt`; `src/cli/build.ts`
reads it back, so its one clang call compiles the generated C to bitcode too and the link is one
module. The probe, not a guess, decides: ld64 and lld read bitcode archives, GNU ld only with the
LLVMgold plugin, and a wrong assumption is an unreadable archive on every compile. `build-asan/`
never uses LTO (sanitizer reports should name a line, and cross-module inlining blurs them). A
changed probe result or Boehm status now rebuilds every object (`build*/cflags.txt`): the timestamp
walk cannot see a flag change, and a mixed archive links fine while silently lacking what the flag
was for. `just runtime-test` links the print corpus from `link-flags.txt` instead of rediscovering
`-lgc` itself, which also removes a duplicate of the Boehm probe.

Measured here (Apple clang 21.0.0, arm64 macOS, Boehm 8.2.12, a 200k-element array/Map/string/
class loop ×20, best of 6, `GC_DONT_GC=1` so collection timing does not enter): 1262 ms → 1203 ms
(−4.7%); binary 72,536 → 88,024 bytes; the CLI's compile+link step 81 ms → 330 ms. Modest, and the
compile-time cost lands on every golden fixture; `tests/bench/baseline.json` compile times will
read high against this until re-recorded.

**Found while measuring, not fixed here:** the same program is nondeterministic and sometimes
segfaults with the collector on, in both the LTO and the plain build, and is deterministic and
matches Node with `GC_DONT_GC=1` — a live object is being collected. Each of the four loops alone
(array push/for-of, Map set/get, string `+=`, class instances in an array) runs clean; the
combination does not. Tracked as its own task; it predates this note.

Check: `just runtime` prints `thin LTO`, `file runtime/build/jsrt_ops.o` says `LLVM bitcode`,
`link-flags.txt` starts with `-flto=thin`; `pnpm run test:golden` and `just runtime-test` pass on
the bitcode archive; `just runtime-asan` reports `no LTO (sanitized build)`.

## 163. The roots hook replaced Boehm's stack scan instead of extending it (2026-09-02)

The nondeterminism note 162 found. Minimal failing pair: a Map filled with 200k `set`s over 5000
keys, then 20k string concatenations, twenty rounds — each loop alone was clean 8/8, the pair
failed 10/10, and always the same way: at the grow from 4096 to 8192 entries the map's `used`
collapsed to the inserts since the previous grow while `size` kept counting, so every key placed
before it was unfindable and got re-inserted (`size` 5008, 7048, 9096 in the golden runs; the
"+8" totals were `m.size` overshooting). A C harness that mirrors the pair and checks
`GC_base(m->entries)` after every insert caught the moment: inside `grow`, the freshly allocated
entries block — held only in the C local `entries` while the index was allocated — was on Boehm's
free list by the time the index allocation returned, and the next large allocation (a 40 KB
string, or the next grow) was carved out of it and zero-filled. `GC_is_marked` at every mark end
said the header, the old entries and the old index were marked: hook 1 and the frame roots were
doing their job. What was missing was the C stack.

Root cause: `GC_set_push_other_roots(jsrt_push_roots)` *replaces* the hook. In a threads-enabled
Boehm — every packaged one, Homebrew's and Debian's — the hook it replaces is `GC_push_all_stacks`,
which is the conservative scan of the C stack and registers (`mark_rts.c`: "in the threads case,
this also pushes thread stacks"). So since note 108 no raw pointer in a runtime local has been a
root. Everything reachable from a frame slot survived, which is why the corpus, the goldens and
the leak test stayed green; only a function that allocates twice and holds the first block in a
local across the second could lose it — `grow` (entries, then index), `jsrt_array_new` (header,
then elements), the iterator and promise constructors — and only when a collection landed between
the two, which took the string churn to provoke.

Fix: `jsrt_gc_init` saves `GC_get_push_other_roots()` and `jsrt_push_roots` calls it first, then
walks the frames. One static and three lines; the design in §4.12 is unchanged, it simply now
holds. The harness runs clean 20/20 rounds with the fix and fails within three rounds without it.
Not a rooting bug in generated code: the emitter already keeps every temporary in a slot, and
`--keep-c` on the reproducer confirms it.

Check: `tests/golden/ts/gc_roots.ts` (the four loops, twenty rounds, plus a per-key count check)
matches Node; before the fix it printed varying totals and died with SIGSEGV/SIGBUS about one run
in three. `pnpm run test:leak` still plateaus.


## 164. Expression-position residue is one family of HIR nodes, not a second lowering (2026-09-02)

Family (b) of Phase 5 step 12. The gate's leftover `describeKind` catch-alls were labels on a
block, value-position `++`/`+=`/`=`, `**` / `void` / comma / ternary / `in`, for-in, builtin
`instanceof`, and capturing a loop `let`. Each is now a node the HIR already had or a small
addition (`UpdateExpr`, `ConditionalExpr`, `Block.label`, `perIterationEnv`), not a mode-aware
special case below the gate.

Decisions that need a note rather than a comment:

- **Value-position assignment is `UpdateExpr` with `operator: '='`.** Statement position still
  folds to `Assignment`. The comma fixture `(n = 1, n + 1)` is why `=` cannot stay
  statement-only.
- **`instanceof Function` names a tag, not the constructor.** `Function` as a value is still
  STA1103/STA1206; the right operand of `instanceof` is not a global read (`isGlobalReference`).
- **Per-iteration environments skip `var`.** `for (var i)` is one function-scoped binding;
  cloning it made `tests/golden/js/var_hoist.js` disagree with Node (1\n2 vs 2\n2).
- **A `for` incrementor runs on the control env after the clone is committed.** Incrementing the
  clone itself left `() => i` seeing 1, 2, 3 after the loop. Node's 0, 1, 2 is the body snapshot.
- **The clone is the whole `JSRTEnv`.** Mixed shared+per-iter slots in one function env are an
  approximation; goldens keep the classic "only `i` is captured" shape, inside a function (a
  module-level `let` is a global, not an env slot).
- **A simple ternary still writes its frame slot.** Eliding the store for `c ? 1 : 2` left
  `JSRT_GLOBALS` larger than any `JSRT_GLOBAL(i)` write (`frames.test.ts`).

Not in this family: accessor compound (`o.x += 1` on a getter) stays (d); `#n in o` stays
not-yet; boxed `Error`/`Boolean`/`Number`/`String` have no representation, so `instanceof` them
answers false.

Check: `tests/golden/{ts,js}/expr_residue.*` match Node; subset family-(b) rows are out of
`@expected-fail`; `pnpm run test:subset` 322 fixtures, 0 failed.

## 165. Phase 6 evidence harnesses are offline-safe and pinned (2026-09-02)

Phase 6's runner surfaces are now present without adding a dependency: Test262 stores only its
corpus SHA and fetches into an ignored directory, the differential fuzzer uses xorshift32 seeds,
and the benchmark recorder retains the Phase 2 baseline while adding runtime/RSS/engine results.
The Test262 runner deliberately reports a visible skip when the corpus is absent, and treats an
unmapped feature tag as a failure. The nightly workflow derives its fuzzer seed from
`github.run_number`; it uploads findings and benchmark results rather than committing from CI.

The thin-LTO toy probe was a false positive on this host's pinned conda-clang 21.1.8/Darwin
linker: it accepted the toy archive but the real runtime archive aborted with `LLVM ERROR:
Unsupported stack probing method`. `justfile` therefore disables LTO on Darwin until a real
runtime/archive probe exists; Linux retains the probe. This is a compatibility guard, not a
semantics change to the runtime.

The owner policy for weekly results is **no CI write-back to `main`**: CI uploads the immutable
JSON artifact and the generated page; a deliberate owner-side commit is required for a result to
enter history. This avoids a bot commit racing feature work while preserving every measurement.

## 166. Runtime object stamps include the compiler identity (2026-09-02)

The incremental runtime build previously keyed `cflags.txt` only by flags. Switching the pinned
toolchain from Apple clang 21.0 to conda-clang 21.1.8 left stale ASan objects in `runtime/build-asan`;
the next link failed with `___asan_version_mismatch_check_apple_clang_2100`. The just recipe now
stamps the compiler's first version line along with both CFLAGS strings, forcing all objects to
rebuild when the compiler changes. This is required for sanitizer archives because the compiler
runtime ABI is part of the object contract even when source and flags are unchanged.

## 167. Darwin ASan uses Apple clang (2026-09-02)

The pinned conda-clang 21.1.8 sanitizer runtime never reaches `main` on this Darwin 25/26 host:
even a one-line ASan program hangs in `libclang_rt.asan_osx_dynamic.dylib` while initializing
shadow memory, and `sample` shows the sanitizer's static spin mutex waiting during dyld malloc
initialization. The same program and Stator's `print_numbers` corpus complete with Apple clang
21.0.0 from `/usr/bin/clang`; release builds remain on the pinned conda compiler. The ASan just
recipes and generated-C build therefore select Apple clang only when Darwin's compiler is the
default command name `clang`, while preserving an explicit compiler-path `CC` override. This is a host toolchain workaround,
not a runtime or semantics change.

## 168. Test262 async adapter must use the landed JS subset (2026-09-02)

The initial `tests/test262/harness/sta.js` declared `$DONE` as a named function expression. Stator
rejects named function expressions with STA1214, so every async Test262 test failed at compilation
before reaching its assertions. The adapter now uses an anonymous function, prints
`Test262:AsyncTestComplete` on successful `$DONE()`, and the runner requires that marker for
`flags: [async]`. A temporary pinned-style corpus test passes end to end.

## 169. JS-mode dynamic calls must reach the runtime (2026-09-02)

Test262 runtime-negative coverage exposed TypeScript diagnostic 2349 (`This expression is not
callable`) as another checker refusal that violates JS mode's untyped-code contract. It is now
suppressed alongside the dynamic property diagnostics, allowing an unknown callee to reach the HIR
and runtime's STA2006 TypeError path. A statically inferred number remains verifier-rejected; the
valid dynamic case is an untyped parameter, which is the intended boundary.

## 170. Test262 negative and expected-failure verdicts are explicit (2026-09-02)

Negative tests cannot rely only on error-name text: Stator compile diagnostics carry an STA code,
while runtime diagnostics may name a JavaScript class in their message. The runner now has an
explicit STA-to-class table (including STA0012 parse SyntaxError and the runtime TypeError/RangeError
cases), refusing to infer a class from an unmapped STA diagnostic. Known expected failures no longer
fail the job by themselves, but a pass, skip, or missing path makes the expectation stale and fails
the run.

## 171. Test262 adapter follows repository lint rules (2026-09-02)

The async `$DONE` adapter's anonymous function was semantically correct but Biome's
`useArrowFunction` rule made the Phase 6 lint Check fail. It now uses an arrow function, which is
also accepted by the JS-mode subset and preserves the completion-marker behavior.

## 172. Test262 standard frontmatter precedes execution metadata (2026-09-02)

The pinned `771005236e88a909635104e03ba12559688c0172` corpus puts every `/*---` block after a
copyright header, not at byte zero, and its 53,580 frontmatter-bearing tests standardly use
`description`, `info`, `author`, `es5id`, and/or `es6id` as well as execution metadata. The
original Step 6.1 wording, which allowed only six keys and required the block on line one, would
therefore reject every test before feature mapping. Step 2 now distinguishes standard descriptive
metadata (recognized but deliberately not interpreted) from execution metadata, still hard-errors
on an unknown *top-level* key, and explicitly reports the 294 legacy files with no frontmatter
rather than silently excluding them. This is a corpus-format compatibility correction, not a
relaxation of the corpus-bump tripwire.

## 173. Test262 corpus must be ignored by every local tool (2026-09-02)

The Step 6.1 text already required `tests/test262/corpus/` to be git-ignored, but `.gitignore`
omitted it. Fetching the pinned corpus therefore made 53,874 third-party files candidates for
Biome; `pnpm run format` then reached dynamic-import syntax that panics the installed Biome parser.
The path is now ignored. This makes the fetch destination the promised local cache, keeps format
and lint scoped to repository-owned files, and prevents accidental commits of the 50k-file corpus.
Biome has an explicit include allowlist, so it needs the matching `!tests/test262/corpus` exclusion
as well; `.gitignore` alone does not override that list. The runner's ignored `results.json` and
temporary directory need the equivalent exclusions too: a result is generated on every conformance
run and formatting it would make `pnpm run ci` fail after a successful offline/mini-corpus run.

## 174. Test262 feature tags map conservatively by full semantic surface (2026-09-02)

The pinned corpus exposes 198 distinct `features:` tags. Those tags are not one-to-one with
Stator's landed slices: for example, a tagged test may exercise typed-array, class-field, or
iterator semantics far beyond the subset's small, implemented form. `features.ts` now has a closed
generic `STA1214` list for every such tag, cited by a new `SUBSET.md` Test262 coverage row, instead
of treating it as supported because *some* related operation landed. The runner still errors on a
future unknown tag, retaining the corpus-bump tripwire. The map also uses own-property checks:
Test262's `__proto__` tag otherwise inherited `Object.prototype` and silently appeared supported.

## 175. The Test262 harness found two js-mode checks that reject valid JavaScript (2026-09-03)

Running the pinned corpus for the first time produced 98 failures in a 113-test slice, and every
one of them was the runner or the gate refusing the HARNESS, not the test:

1. **`tests/test262/harness/sta.js` shadowed the corpus file of that name.** Step 3 says a test is
   `harness/assert.js` + `harness/sta.js` + `includes:`. Those are corpus files; the corpus's
   `sta.js` is what defines `Test262Error` and `$DONOTEVALUATE`. Stator's adapter took the same
   name and defined only `$DONE`, so `assert()` threw a `Test262Error` that no longer existed and
   every harnessed test died on `Cannot find name 'Test262Error'`. The adapter is now
   `harness/done.js`, holds `$DONE` alone, and is concatenated *after* both corpus files. The name
   was the whole bug: a file named for a corpus file reads as that corpus file.
2. **`noFallthroughCasesInSwitch` and `useUnknownInCatchVariables` were on in js mode.** Both
   refuse *valid* JavaScript rather than *untyped* JavaScript, which is the line §1.2 draws
   ("untyped means dynamic, not rejected"). `formatIdentityFreeValue` in `assert.js` falls through
   on purpose, and `formatSimpleValue` reads `err.name` off a catch binding — the two most ordinary
   ES5 idioms there are. They now follow the `noImplicitAny`/`noImplicitOverride` precedent already
   in `program.ts` and are `mode === 'ts'`. ts mode keeps both: there a fallthrough is nearly always
   a missing `break`, and an `unknown` catch is §0.2's boundary rule.

This is Phase 5 step 2's residue, not new work — step 2 switched the *diagnostic table* by mode and
did not audit the *compilerOptions* for the same contract. The evidence is why the plan wants a
conformance suite: no decision fixture had asked either question, because both constructs are ones
nobody writes deliberately in TypeScript.

Two further runner changes came out of the same run:

- **A not-yet diagnostic on a positive test is a skip, not a failure.** §1.3 makes the never and
  not-yet ranges disjoint precisely so a test can tell intent from schedule, and step 4 already
  applies that rule to negative tests. A build that raised *nothing but* `STA12xx` is now a skip
  attributed to the lowest such code; a build that also raised anything else stays a failure, so
  the skip bucket cannot swallow a real refusal.
- **Unexplained failures are reported, not fatal.** At 53,874 tests a per-test `expected-fail.txt`
  cannot be the gate without becoming a file nobody reads, and an unreadable list explains nothing.
  The ratchet is the gate — that is what step 7's "monotonically tracked" means — and the runner
  prints a bounded sample plus the total so the failures stay visible.

Finally, the runner is now a pool over `availableParallelism()` (6.3× on this host: a 113-test
slice went 37 s → 5.9 s). That is not an optimization: a serial pass is ~5 hours, and step 8 asks
for a per-commit CI job. Temp filenames gained the pool slot — keyed by pid alone, two workers
would have compiled each other's source and reported the answer to the wrong test.

And the CI job the whole task exists to feed was reporting nothing. `pnpm run test262 2>&1 | tee
test262.log` makes `tee` the step's exit status, because `pipefail` is not on for a `run:` step —
so the ratchet could fail, the summary line could say anything, and the job would still be green.
That is precisely the failure mode §9's opening paragraph names, sitting in §9's own workflow.
Fixed with an explicit `shell: bash` + `set -o pipefail`, plus a `timeout-minutes` of its own so a
hung corpus pass looks hung instead of inheriting the six-hour default.

## 176. The first Test262 number, and the two skips that were not tests (2026-09-03)

The first full pass over the pinned corpus (53,874 files) read **1405 passed, 8212 failed, 44,257
skipped — 14.6%**. Two entries in that skip column were not conformance facts about Stator:

- **17,003 tests skipped on `flags: [generated]`.** INTERPRETING.md §"generated" says only that the
  file "was created procedurally using the project's [tooling]" — it is provenance, not a host
  capability, and it changes nothing about how the file is built or run. The adapter's
  `ALLOWED_FLAGS` did not list it, so the "flags the adapter does not implement are a SKIP" rule
  (step 3) silently retired **a third of Test262**. Step 3's rule is right; the flag was misfiled.
- **294 `_FIXTURE.js` files counted as skipped tests.** INTERPRETING.md: files bearing `_FIXTURE`
  "MUST NOT be interpreted as standalone tests" — they are imported *by* module tests. They have no
  frontmatter, so they landed in the `missing frontmatter` bucket, which is the bucket that is
  supposed to mean "a real test whose header we could not read". They are now excluded from
  enumeration; the one genuine headerless test
  (`Function/prototype/toString/line-terminator-normalisation-CR.js`) still reports as a skip.

Both are the same shape as the harness bug in note 175: **the skip column is where a runner's own
defects go to hide**, because a skip looks deliberate. Everything in it has to name a rule, and the
rule has to be about the compiler.

**What the failure column actually says.** 8212 failures, and `STA0012` — a TypeScript checker
refusal, not a Stator gate decision — is essentially all of them. The top buckets:

| count | diagnostic |
|---|---|
| 2861 | `'x' is possibly 'null'/'undefined'` |
| 805 | argument type not assignable to parameter type |
| 456 | cannot find name |
| 419 | object is possibly 'undefined' |
| 407 | implicitly has an 'any' type |
| 326 | type not assignable to type |

The largest bucket is one finding, and it is note 175's finding again at scale: **`strictNullChecks`
refuses ordinary JavaScript in js mode.** ~3400 of the 8212 are the possibly-null family. The fix is
NOT `strictNullChecks: false` — compilerOptions are program-wide, so that would also strip null
safety from the `.ts` half of a mixed graph and quietly delete the boundary checks §0.4 requires.
It is to suppress the possibly-null *diagnostic codes* in js mode the way 2339/2551/2353/2349
already are, leaving `T | undefined` in the type so the union still lowers to the dynamic path and
the check still happens — at run time, which is where a dynamic value's check belongs.

That is Phase 5 step 2 work, not Task 6.1 work, and it is recorded as such rather than folded in
here: this task's job is to publish an honest number and a ratchet, and it now has both plus a
measured, ordered backlog for the phase that owns the surface. Which is what §9 says the phase is
for — it produces evidence, not features.


## 177. The fuzzer's three unreachable regions, and the two defects that hid them (2026-09-03)

**Context.** `plan.md` §9 Task 6.2 step 4 names five regions the generator must weight toward,
"because everything else is already covered by fixtures": float formatting and the shortest
round-trip boundary, the `i32` refinement's overflow edges, string indexing across surrogate
pairs, `Map`/`Set` key identity (`-0`, `NaN`), and coercion order in `==`. The generator covered
the first two — `NUMBER_EDGES` carries both — and none of the last three.

**Two defects, not one gap.**

1. *Cross-type `==` was ungeneratable.* TypeScript's 2367 ("this comparison appears to be
   unintentional because the types have no overlap") fired in **js** mode, so `"" == 0` was a
   compile error. That is a lint about intent, and in JavaScript a cross-type `==` is not a
   mistake — it is the coercion table, which is most of what js mode exists to run. Suppressed in
   js mode alongside 2339/2551/2353/2349, which are the same judgement about a member rather than
   an operator. ts mode keeps it: there both operand types are known and disjoint, so the
   comparison cannot be anything but a bug. Pinned by the `subset_loose_equals_cross_type_{js,ts}`
   pair. This is the same finding as note 175 — the two checks there rejected *valid* JavaScript
   rather than untyped JavaScript — arriving a third time, which is why §8 step 2a exists.

2. *The time budget was shared, not split.* `--minutes=N` set one deadline for the whole run, so
   the first mode spent the entire budget and the second fell through to `count` cases — one, by
   default — and still printed a clean sheet. An hour-long nightly would have fuzzed `ts` for an
   hour, `js` for one program, and reported "0 divergences" for both. The arm that would have
   silently disappeared is `js`, which is step 8's whole subject. Now `budgetPerMode =
   minutes * 60_000 / modes.length`, with a fresh deadline per mode.

**What landed.** `IDENTITY_EDGES` (`NaN`, `Infinity`, `-Infinity`, `-0`, `0`) is deliberately
kept out of `NUMBER_EDGES`: arithmetic over those values mostly yields `NaN`, which would drown
the float-formatting region rather than add to it. The typed program now prints `text.length`,
`text.charCodeAt(i)`, an identity edge, and `1 / edge` — the last because `-0` and `0` print
alike in some positions and `-Infinity` vs `Infinity` is the cheapest way to tell them apart. The
dynamic program adds `Map`/`Set` construction over two identity edges (SameValueZero agrees with
neither `===` on `NaN` nor `==` on `-0`, so it is reachable only through the containers) and a
cross-type `==`. `Object.is` stays out: still `STA1214`, and step 3's rule is that a generated
program which fails to compile is a **generator** bug.

## 178. The fuzzer's first finding: lone surrogates were lost in the C source (2026-09-03)

**Divergence.** `const text: string = "\ud800"; console.log(text.charCodeAt(0));` — Node answers
`55296`, Stator answered `65533`. Seed 20260915, ts mode, found within seconds of the generator
gaining step 4's surrogate region (note 177). Minimized to two lines by `minimize.ts`.

**Cause, and where it was not.** The runtime is correct: `JSString` is `uint16_t data[]`, and
`jsrt_string_char_code_at` reads a code unit straight out of it. `utf8_decode` is already
WTF-8-tolerant — it never rejects the three-byte encodings of `D800..DFFF`. The loss was in the
**emitter**: `escapeString` copied non-ASCII source characters verbatim into the generated `.c`,
and writing an unpaired surrogate to a file as UTF-8 substitutes U+FFFD. By the time clang saw
the literal the code unit was already gone, so nothing downstream could have recovered it.

**Fix.** `wtf8Bytes` encodes the literal from its UTF-16 code units — pairing lead+trail into a
four-byte sequence, and encoding an unpaired surrogate as its own three-byte sequence — and
`escapeBytes` writes every byte outside printable ASCII as a **three-digit octal** escape. Octal,
not `\x`: a C hex escape consumes as many hex digits as follow it, so `"\xEDa"` is one
out-of-range character rather than two. The byte count passed to `jsrt_string_from_utf8` now comes
from that array rather than from `Buffer.byteLength(value, 'utf8')`, which was computing the
length of the *lossy* encoding — two bugs that happened to agree.

**Why this is the region step 4 named.** No hand-written fixture had a lone surrogate in it,
because nobody writes one on purpose; the golden suite had thirteen string files and every one of
them was well-formed. This is exactly the class the step calls "where a divergence is a semantics
bug rather than a typo", and it took the generator about one second to find once it could reach
it. Landed as `tests/golden/ts/string_surrogates.ts` with the pre-minimization program in
`tests/differential/corpus/` (step 7).

## 179. The leak test's plateau window was indexed, not anchored (2026-09-03)

`pnpm run ci` went red on `tests/leak` — `RSS climbed from 32 KB to 3024 KB — no plateau` — and five
consecutive reruns passed with the same peak (3008–3024 KB, ~5% of the 64 MB cap). Nothing leaked:
the middle third of the samples was still process STARTUP.

The plateau check compared `max(samples[n/3 .. 2n/3])` against `max(samples[2n/3 ..])`. That split
assumes the middle third is past startup, and the run is under a second with a 25 ms sampler, so
`ps` yields ~20 samples and one early sample landing at 32 KB makes the steady-state 3 MB tail read
as a 94× climb. The verdict depended on how many samples the scheduler let through before the heap
came up, which is a coin flip, not a measurement.

The window is now anchored on a VALUE: drop every sample before RSS first reaches half the peak,
then compare the halves of what remains. Same assertion — memory must stop growing — with a start
point the sampling rate cannot move. The cap check is untouched and is still the one that separates
"collected" from "never freed" (320 MB if nothing is ever freed, against a 64 MB cap).

Worth naming because of where it sat: a flaky red is the mirror image of the failure mode §9's
opening paragraph is written against. A green that proves less than it appears to teaches people to
trust a signal that is not there; a red that fires on jitter teaches them to re-run until it is
green, which costs the same signal by the other route.

## 180. The possibly-null family, and the two type sources that disagreed under it (2026-09-03)

**What landed.** plan.md §8 step 2a(a): the nine possibly-null diagnostic codes — 2531/2532/2533
(`Object is possibly …`), 2721/2722/2723 (`Cannot invoke an object which is possibly …`) and
18047/18048/18049 (`'x' is possibly …`) — are suppressed in js mode, joining 2339/2551/2353/2349
and 2367. They were **3855 of Task 6.1's 10,513 failures**, the largest bucket by a factor of three,
and every one of them is JavaScript that runs: `xs[i] + 1` is how the language indexes an array.

The suppression is of the CODE and never of the OPTION. `strictNullChecks: false` or
`noUncheckedIndexedAccess: false` is program-wide, so in a mixed graph it would strip null safety
from the `.ts` half and delete the boundary checks §0.4 requires. Leaving `T | undefined` in the
type is the point: the union lowers to the dynamic path, and the check still happens at run time.
The five-code `||` chain became an enumerated `JS_MODE_RUNTIME_CODES` set with a reason per line —
enumerated and not ranged, because an operation no runtime could settle must stay a hard error.

**Test262 moved: 10,513 failures → 9222, pass rate 18.5% → 20.5%, `passed` unchanged at 2379.**
That last clause is the honest half. The 1291 tests did not start passing; they stopped being
refused by a *checker lint* and are now refused by *Stator's own schedule* — they land in the skip
column attributed to an `STA12xx`, which is what §1.3's disjoint ranges are for. The pass number is
the one that says the compiler runs more JavaScript, and it did not move. What moved is the
attribution, and the next bucket is now visible underneath: `Argument of type 'X' is not assignable`
went 992 → 3233 as the tests that used to die on possibly-null reached their second diagnostic.
That re-measure is exactly what step 2a(b) asks for, and it is now recorded rather than predicted.

**The defect the suppression uncovered.** `/** @type {{a:number}|undefined} */ var box = {a:7};
box.a` compiled to `STA4060 no field 'a' on unknown` — an internal error, so a compiler bug by
`AGENTS.md`'s own definition. Two type sources disagreed about one expression:

- `typeAt(node)` answers with `checker.getTypeAtLocation`, the **narrowed** type at that use. CFA
  narrows `box` to `{a:number}` there, so `isClassInstance` said "object" and the branch that wants
  a field SLOT was taken.
- an identifier **lowers to its binding** — the declared type, `Unknown` — and the `boundary-check`
  that would reconcile the two is only inserted when the narrowing is one a tag can settle
  (`isCheckable`: number, string, boolean). An object-shape narrowing is not, so no check was
  inserted and the value stayed dynamic.

They agree on every narrowing that is checkable and disagree on every one that is not, which is why
nothing had noticed: a `.ts` program cannot get there (`unknown` narrowed to a shape is refused
before lowering) and no `.js` fixture had a JSDoc'd nullable object. The fix is in `typeAt`, the one
function every branch selection consults: when the identifier's binding is `Unknown` and the
narrowed type is not checkable, answer the binding. The value really is dynamic at run time — that
is a fact about the value, not a concession — so this is the truthful answer and not a workaround.
It returns the binding rather than a fresh `hUnknown(false)`, because an `Unknown` carries whether
it came from an implicit `any` and the verifier compares the two for equality (`js/destructure.js`
caught that within one run).

Worth recording separately: the comment at that site claims "the gate has already refused any
narrowing this cannot check (`isCheckable`)". It has not — `narrowedTo`/`isCheckable` are imported
by `src/lower/` and by nothing in `src/frontend/gate.ts`. The invariant was asserted in prose and
enforced nowhere, which is how the two readings drifted apart in the first place.

**Residue, named rather than hidden.** `xs[i].toFixed(2)` now compiles and then panics `STA2006` at
run time, because a method call on a *dynamic primitive* needs `Number.prototype` dispatch and the
runtime has no prototype chain (Phase 8 owns that surface). It is not a wrong answer — it is a
located abort — but it is not Node's answer either, so the golden fixture stays on the forms the
dynamic path can run and this line is the record that the gap is known.

## 181. A fixed shape had two orders and used one: reordering annotations miscompiled, spread was blocked (2026-09-03)

Found while landing plan.md §8 step 12 family (c). Reproduction, three lines of ordinary
TypeScript, no spread involved:

```ts
const o: { y: number; x: string } = { x: "s", y: 2 };
console.log(o.x);   // Stator: 2      Node: s
console.log(o.y);   // Stator: s      Node: 2
```

A silent wrong answer, not a diagnostic. The cause is that a fixed shape has **two** orders and the
compiler had conflated them:

- **Layout** — which slot a field lives in. `slotOf` resolves `o.x` by looking the name up in
  `target.type.fields`, so the layout is a property of the TYPE. Here that is the annotation's
  order, `y, x`.
- **Enumeration order** — what `console.log`, `Object.keys`, and `for…in` answer. §10.1.11
  OrdinaryOwnPropertyKeys says insertion order, which only the ALLOCATING LITERAL knows. Here that
  is `x, y`.

`registerShape` built the class descriptor from the literal's `entries` and the emitter stored
`entries[i]` into slot `i`, so writes used the literal's order while reads used the type's. Printing
was right by accident (the descriptor's names came from the same entries as the values), which is
why 140 golden fixtures passed: in every one of them the two orders coincided.

**Object spread makes them coincide never.** TypeScript's spread result type puts explicit
properties first: `{ ...base, y: 2 }` with `base: {x, z}` types as `{y, x, z}`, while JS builds
`x, z, y`. Measured, not assumed. So spread could not land on the fixed path until the two orders
were separated — which is the real reason family (c) had spread listed beside shorthand.

**The fix, at the layer that owns each fact.**

1. `JSRTClass` gains `key_order`: slot indices in insertion order, `NULL` when insertion order IS
   slot order (a class declaration lays fields out in the order it writes them, so it always is).
   `jsrt_class_key_slot` is the one accessor; `jsrt_print.c` and `jsrt_object_ops.c`'s `collect`
   are the only two walks that had to change.
2. The lowering takes the **contextual** type as the literal's layout when there is one, so the
   literal stores to the slots later reads resolve against. This is the same "the contextual type
   wins" rule `objectLiteralIsDynamic` already applies one line above.
3. The emitter stores each entry into its NAME's slot, not its position, and emits `key_order` from
   the entry order. The descriptor cache is keyed by shape name **plus** key order — one type with
   two insertion orders is two descriptors, or the second literal prints in the first's order.
4. The HIR verifier's check was "entry `i` is the shape's field `i`", which is exactly the
   conflation. It is now the invariant that survives: every entry names a field of the shape, and
   the literal covers the shape exactly.

Spread then falls out as pure lowering: `{ ...a }` expands to one `field-access` per field of `a`'s
shape. The gate holds the operand to an **identifier** — the expansion reads it once per field, so
anything with an effect would run that effect N times — and to a fixed shape. `{ ...a, x: 1 }`
needs no dedup rule: both entries resolve to one slot and the emitter stores in source order, so
the last write wins the way §13.2.5.5 says, and `keyOrderOf` keeps the key's first position.

**Residue in family (c), named rather than hidden.** A spread of a call result, a member access, or
a value with no fixed shape stays `STA1214`; methods and accessors in a literal stay `STA1214` (both
need calling through a shape the declaration does not build, and accessors need a get/set slot the
runtime has no representation for); computed keys stay `STA1214`.

## 182. JSDoc optionality is not a JavaScript parameter-order rule (2026-09-03)

TypeScript diagnostic **1016** (`A required parameter cannot follow an optional parameter`) is now
suppressed in `js` mode only. Its premise is metadata: JavaScript parameters have no optional marker
and no signature-order rule, so a JSDoc declaration such as `@param {number=} first` followed by
`@param {number} second` executes with the ordinary positional calling convention. The matching
TypeScript spelling stays an `STA0012` error in `ts` mode.

The suppression is deliberately one code, not a relaxation of compiler options. The paired subset
fixtures and `tests/golden/js/required_after_optional.js` prove the distinction and the Node result.
It is the first individually judged item in plan.md §8 step 2a(b). The full Test262 pass from this
exact tree remained **2379 passed, 9222 failed, 41979 skipped**: it did not change the ratchet.
That is not an ineffective suppression. The runner classifies a TEST only after all its checker
diagnostics are considered, and each affected Test262 harness program still raises another
`STA0012` (for example the `PropertyDescriptor | undefined` argument mismatch). The old 1016 line
is absent; the test stays a failure for the next independently unsuppressed code. The plan's former
requirement that every code suppression move an aggregate test ratchet was therefore impossible
for multi-error programs; its Check now distinguishes a classifier-changing suppression from one
that merely exposes a later blocker, retaining the aggregate ratchet and requiring this per-code
evidence for the latter.


## 183. Function arity is runtime behavior in JavaScript (2026-09-03)

TypeScript diagnostic **2554** (`Expected N arguments, but got M`) is now suppressed in `js` mode only. The existing closure ABI already carries an argument count: extra values are ignored and `jsrt_arg` supplies `undefined` for an absent parameter, matching Node. A typed JS function call is therefore static after the checker refusal is removed; the TS-mode fixture retains `STA0012`.

The subset and golden fixtures cover both directions. The full pinned Test262 run from this tree passed with **2379 passed, 8839 failed, 42362 skipped**, ratcheting 383 tests from failure to a scheduled skip while retaining the pass count.


## 184. A checker-inferred binding must widen before JavaScript can reassign it (2026-09-03)

TS2322 is now suppressed in js mode only, but not as a bare diagnostic filter. The frontend records
the diagnosed binding symbol and passes that mode-free lowering policy downstream; lowering answers
`Unknown` for that symbol, so the HIR verifier sees dynamic assignment rather than the impossible
`number = string` pair. Module and nested-function fixtures prove the symbol identity survives scope.

The full pinned Test262 run is **2379 passed, 8444 failed, 42757 skipped**: 395 further failures
became scheduled skips, with passes unchanged.


## 185. JavaScript argument mismatch needs the callee’s coercion, not only a diagnostic filter (2026-09-03)

**What landed.** JS-mode TypeScript diagnostic **2345** (`Argument of type X is not assignable to parameter of type Y`) is now deferred. The paired function-call fixtures retain the ordinary `STA0012` error in ts mode, while `tests/golden/js/argument_mismatch.js` proves both a compiled function call (`increment("2")`) and `Math.abs("-3")` match the pinned Node.

**Blocker found before landing.** A bare 2345 filter made the Math example reach HIR, where the verifier raised `STA4080`: it asserted every `math-call` argument had HType `number`, despite the C signature accepting a boxed `jsrt_value`. Worse, the runtime then used `jsrt_number_value`, which reads a non-number’s NaN-box payload as a double. Removing only the verifier assertion would have made the compiler emit a wrong native program.

**Decision.** Math’s HIR contract is now exact arity plus a number result; operand coercion is runtime semantics. `jsrt_math.c` applies `jsrt_to_number` once in its shared argument helper, so every Math entry point implements ECMAScript `ToNumber` before numeric work. This preserves statically typed paths and makes a JS argument mismatch execute under JavaScript’s coercion rules. `runtime/include/jsrt_value.h` documents that contract.

**Evidence.** After `just runtime`, typecheck, lint, the subset matrix (**338 fixtures: 307 passed, 31 expected-fail**), the golden corpus (**145/145**) and runtime print corpus passed. The pinned full Test262 run moved from **2379 passed / 8444 failed / 42757 skipped** to **2379 passed / 7433 failed / 43768 skipped**. No passed test regressed; 1011 final classifiers became scheduled skips.
