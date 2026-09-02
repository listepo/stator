# plan.md — Stator: a two-mode AOT compiler for TypeScript/JavaScript

> **Audience:** AI agents (and humans) executing this project. This file is self-contained: read it top to bottom before doing any task. Every task has numbered **Steps** and a **Check** — do not mark a task done until its Check passes. Findings that contradict this plan go into `plan-notes.md` (repo root), not silently into code. Operational conventions (commands, coding standards, workflow) live in `AGENTS.md`; this file is the roadmap and the spec.
>
> **Name:** **Stator** (formerly "Ketch" — renamed 2026-08-29; "Ketch" collides with an established company). A stator is the static half of an electric motor: it doesn't move, and it's what makes the rotor spin. The compiler's two modes mirror stator/rotor — the static `ts` mode and the dynamic `js` mode. CLI binary: `stator`.
>
> **Source research:** "The JS AOT Field Guide" (five multi-agent research fan-outs, 2026-08-28/29, ~700 web lookups): prior art (30+ projects incl. graveyard), Static Hermes vs Perry vs Porffor vs scriptc head-to-head, FFI survey, JS→Rust-target rejection, engine-embedding costs, Boa internals deep-dive. Competitor performance figures below are self-published — treat as directional, re-benchmark locally.
>
> **Verification:** v1.1 was adversarially reviewed by three independent checker agents; all 24 findings folded in. v2.0 is a directed pivot (implementation language, modes, rename) — see §16.

---

## 0. Prime directives (read before anything)

1. **Compile a typed subset. Never attempt untyped, full-semantics JS→native via static analysis.** Every dead project in the field (JSSAT, NectarJS, TSLL, ts2c…) tried to statically compile untyped JS with full semantics; every living one (Static Hermes, Perry, Porffor, scriptc) compiles a typed or restricted subset and is explicit about what it drops. Path explosion in abstract interpretation of untyped JS is what killed JSSAT. In Stator, untyped code is handled by *dynamic representation at runtime* (tagged values, shapes, inline caches) or the Phase-8 interpreter tier — never by heroic static analysis.
2. **TypeScript types are unsound. Never trust an annotation without a boundary check.** `as` casts, out-of-date `.d.ts` files, bivariant method params, and `JSON.parse` all let lies into the type system. Trust types *inside* checked code; insert runtime checks wherever untyped/external values enter (Static Hermes model).
3. **Don't write a parser. Don't write a type checker.** The compiler is TypeScript, so use the `typescript` npm package **in-process**: `ts.createProgram(...)` for parsing + module graph, `program.getTypeChecker()` for types. Lower directly from the TS AST (`ts.Node`) — no ESTree conversion layer. Do **not** build on `tsgo`/TypeScript 7's compiler API (explicitly incomplete as of the TS 7.0 RC) — re-evaluate quarterly in `plan-notes.md`.
4. **Emit C first, LLVM IR later.** Static Hermes, Porffor, and scriptc all print C: easier debugging, `#line` source mapping for free, clang does the heavy optimization. A direct LLVM backend is a later optimization (and can be plain `.ll` text emission — no bindings needed), not a starting point.
5. **Never emit Rust, and don't use Rust anywhere in this project.** Rust-as-target was measured and rejected (dyn-dispatch overhead, DSTs, `Rc<RefCell>` aliasing, slow borrow-check on generated megafiles). The compiler is TypeScript; the runtime is C11. One implementation language per artifact, no FFI between compiler components.
6. **The runtime is the moat, not the codegen.** GC, builtins coverage, strings, RegExp, and ICU are where the years go. Budget accordingly; tree-shake builtins from day 1.
7. **Allocation dominates, not dispatch.** Boa's Cranelift JIT experiment proved it: 10× on numeric loops, <5% on allocation-bound benchmarks; GC tracing 10–16% of time, dispatch only ~13%. This ordering drives the optimization ladder (§12).
8. **One pipeline, two modes.** A mode is a *policy layer* (which files are accepted, which constructs are errors, how untyped code is typed) over one shared pipeline. If a feature seems to require forking the pipeline per mode, the design is wrong — stop and fix the design (usually: the feature belongs to the dynamic representation or the Phase-8 tier).
9. **The compiler itself is strict TypeScript.** Locked `tsconfig` (§4 Task 1.0), no `any` in compiler source, `node:test` for unit tests, runtime dependency budget: the `typescript` package only (v0). The compiler must always pass its own `ts` mode's *philosophy*: fully typed, no dynamic escape hatches.

**Non-goals (v1):** npm-ecosystem compatibility; `eval`/`new Function` (never in `ts` mode; `js` mode not before Phase 8); `Proxy`; `with`; prototype mutation after construction; decorators; full Intl; Node API emulation; Windows (POSIX + clang first); self-hosting the compiler.

---

## 1. Product spec — the two modes

This section is the requirement source. `docs/MODES.md` and `docs/SUBSET.md` (delivered in Phase 1) operationalize it; they may add detail but may not contradict it without a §15-protocol plan edit.

### 1.1 `--mode=ts` (default) — strict static TypeScript

- **Inputs:** `.ts` files only. Any `.js`/`.jsx`/`.tsx` file anywhere in the module graph is a compile error (`STA1002`) with the hint "use `--mode=js`". (`.tsx` is out of scope for v1 in both modes.)
- **Typing:** the program must type-check under the strict settings Stator imposes (Stator owns `compilerOptions`; a user `tsconfig.json` contributes at most `paths`/`lib` details). Implicit `any` is an error. **Explicit `any` and `as any` are errors** (`STA1001`) — use `unknown` and narrow. This is the mode's contract: it may trust types precisely because it forbids the lies.
- **Dynamic escape hatches are compile errors, permanently** (distinct "never" diagnostics, not "not yet"): `eval` (`STA1101`), `new Function` (`STA1103`), `Proxy`, prototype mutation (`Object.setPrototypeOf`, writing `__proto__`), `delete` on class fields, `arguments`, `with` (illegal in ESM anyway), `var`, CommonJS `require`.
- **Everything else that is typed TS should eventually compile.** The long-term target is: `ts` mode coverage grows toward "all of type-checked TypeScript minus the closed list above". Gaps on the way are "not yet" diagnostics naming the phase that delivers them.
- **Sound-by-boundary:** values from `unknown`, unions, `JSON.parse`, and FFI are represented as tagged values and runtime-checked at the point of narrowing (§2 value representation). Fully-typed code compiles to raw machine values.

### 1.2 `--mode=js` — JavaScript, and JS + TS mixed

- **Inputs:** any mix of `.js` and `.ts` in one module graph (still ESM-only, still strict mode — sloppy mode and `with` are errors in both modes because ESM is always strict).
- **Typing:** `.ts` files are type-checked and get the static treatment exactly as in `ts` mode (except `any` is *allowed* here and lowers to the dynamic representation). `.js` files are loaded with `allowJs` + `checkJs`-style inference: whatever the checker can infer (including from JSDoc annotations — a freebie from the TS checker) is used to stay on the static path; everything else lowers to the dynamic representation (tagged values + shape tables + inline caches). **No errors for untyped code** — untyped means dynamic, not rejected.
- **JS-only constructs compile:** `var` (function-scoped, hoisted, initialized `undefined`), loose equality `==`/`!=` (full ToPrimitive coercion on the dynamic path), untyped object literals, heterogeneous arrays.
- **`eval`/`new Function`:** "not yet" diagnostic (`STA1206`) until Phase 8 lands the interpreter tier; then supported in `js` mode only.
- **Mixed-graph boundaries:** when a value flows from a `.js` module into typed `.ts` code, the declared/inferred type at the import site is enforced by a runtime boundary check — the same machinery as `unknown` narrowing. A lying JSDoc or wrong inference produces a runtime type error with a source location, not memory corruption.

### 1.3 Mode mechanics (both modes)

- Mode is a CLI flag: `stator build <entry> -o <out> [--mode=ts|js]`. Default is `ts`. No inference magic: a `.js` entry under the default mode is `STA1002` with a hint, not a silent mode switch.
- Every diagnostic carries a stable code (`STA` + 4 digits, `docs/DIAGNOSTICS.md`), the mode, and a source span. `--diagnostics=json` emits machine-readable output. "Never" codes and "not yet" codes are disjoint ranges so tests can tell intent from schedule.
- `stator explain <entry> --mode=... --json` reports, per top-level construct, the verdict `static | dynamic | error(CODE) | not-yet(CODE)`. This is how decision tests (§4 Task 1.4) verify the matrix, and how users audit what went dynamic.
- One pipeline: mode influences (a) file acceptance, (b) the diagnostic table, (c) whether unresolved types are an error (`ts`) or lower to `Unknown` (`js`). Nothing downstream of HIR knows the mode existed.

---

## 2. Architecture and repo conventions (fixed reference — do not re-litigate per task)

```
entry.ts / entry.js (+ module graph)
        │
        ▼
  ts.createProgram  (typescript npm package, in-process; Stator owns compilerOptions)
        │
        ├─► ts.SourceFile ASTs
        └─► TypeChecker
        │
        ▼
  mode policy gate  (ts|js: file acceptance, subset/mode diagnostics, verdicts)
        │
        ▼
  Typed HIR (ours) — every node carries an HType; `Unknown` is a first-class HType
        │   passes: monomorphize, shape-resolve, boundary-check insert,
        │           const-fold, DCE/tree-shake, inline  (verifier after each, debug builds)
        ▼
  C emitter (#line maps) ──► clang -O2 ──► link runtime/build/libjsrt.a ──► native binary
                                                   ▲
        runtime/ (C11): NaN-boxed jsrt_value, Boehm GC (v0) → precise generational (§12),
        builtins, QuickJS-NG libregexp, Ryū dtoa, optional QuickJS-NG interpreter tier
        for eval/untyped modules (Phase 8, js mode only)
```

`docs/ARCHITECTURE.md` renders this section as D2 diagrams (component, sequence, package,
value-flow views) sourced from `docs/architecture/*.d2`. It is a visualization of this section, never an authority over it.

**Repo layout (fixed):**

```
plan.md AGENTS.md plan-notes.md NICHE.md          # root
docs/    ARCHITECTURE.md architecture/*.d2 MODES.md SUBSET.md DIAGNOSTICS.md VALUE.md NUMERIC.md HIR.md TOOLCHAIN.md
src/     cli/  frontend/  hir/  lower/  passes/  codegen/  support/
runtime/ include/jsrt_value.h  src/  vendor/  (justfile)   → runtime/build/libjsrt.a
tests/   unit/  subset/  golden/ts/  golden/js/  differential/  bench/
```

**HType — the internal type model.** Never pass `ts.Type` beyond `src/frontend/`. `src/hir/types.ts` defines a small, serializable, structural type model (`number`, `i32`-refinement, `string`, `boolean`, `null`, `undefined`, `fn(params, ret)`, `array<T>`, `object-shape`, `map/set specializations`, `union`, `generic-instance`, `Unknown`). `src/frontend/types.ts` is the only module that maps `ts.Type → HType`; anything the checker can't resolve maps to `Unknown` (with an `implicit-any` flag) — never a guess. `docs/HIR.md` documents the mapping with ≥10 worked examples (generic instantiation, union widening, JSDoc-inferred, `JSON.parse`, `.d.ts` import, method bivariance…). In `ts` mode, `Unknown`-from-implicit-`any` is an error at the gate; in `js` mode it's the dynamic path.

**Value representation** — 64-bit NaN-boxing (the JSC/QuickJS/Boa-v0.21 consensus; Boa reported double-digit speed and memory wins moving from an enum to NaN-boxing — re-establish on our own benchmarks). Doubles are themselves; quiet-NaN space encodes tag (3 bits) + 48-bit payload: `Int32 | Ptr(Object|String|Array|Closure) | Bool | Null | Undefined`. `docs/VALUE.md` must be written **before any codegen** (Phase 2 Task 2.1) and must specify:
- the exact bit layout, including how `-0.0` survives (it is a valid double, not a boxed int — `Object.is(-0, 0) === false` is a decision test);
- the **string struct**: `struct JSString { uint32_t length; uint16_t data[]; }` — UTF-16 code units (JS semantics: `.length`, `charCodeAt`, Test262 assume it; do not choose UTF-8 for v0), accessed from generated C only via `jsrt_string_length(v)` / `jsrt_string_char(v, i)` inline accessors;
- **number→string is spec-exact**: shortest-round-trip formatting (vendor Ryū's C implementation), byte-identical to Node. Never "round to N decimals" to paper over differences;
- the **GC rooting protocol** (needed by the *first* line of generated C): every generated function opens a `JSRT_FRAME(n)` shadow-stack frame; every local holding a `jsrt_value` or heap pointer is declared through `JSRT_LOCAL(frame, i)`; frames pop on every exit path *including landing pads*. Under Boehm (conservative) the macros may compile to almost nothing — the discipline exists so §12's precise generational GC is a runtime-only change, never a codegen rewrite. (Boa's history: retrofitting precise GC onto undisciplined codegen means rewriting codegen.)

**Statics that are actually typed compile to raw machine values** (unboxed i32/f64/struct fields) — boxing only at boundaries. This is where the 10–20× over interpreters comes from (Static Hermes evidence).

**Errors/exceptions:** return-value + landing-pad style in generated C (`if (jsrt_pending()) goto catch_1;`) — not setjmp/longjmp (bad codegen interactions, GC-root issues). Every landing pad runs the scope's cleanup (shadow-stack frame pops in reverse scope order) before jumping; frame bookkeeping on unwind paths is mandatory and ASan/UBSan-tested (§6 Task 3.10).

**Estimates in this plan are effort, not deadlines.** They exist for sequencing and risk decisions; an agent must never cut a Check to "stay on schedule."

---

## 3. Phase 0 — Go/no-go gate (human decision)

> **Status: ✅ CLOSED 2026-09-01.** `NICHE.md` exists and carries the owner's explicit approval;
> the commit that added it is tagged `phase-0-approved`. Evidence: [done.md](done.md) → Phase 0.
> The steps below stay here because they are the gate's own definition, and §15.1's rule — that no
> phase may be entered without its gate — is enforced by pointing at them.

~~**Task 0.1 — Build-vs-join check.**~~ ✅

Steps:
1. Re-read the field summary in §0.1. The four funded-or-active players: Static Hermes, Perry, Porffor, scriptc. A new compiler is justified only by a niche they don't serve.
2. Write `NICHE.md` (repo root) naming the chosen niche, the competitor that almost serves it, and why they don't. Candidate niches from the research: **TS-native tooling binaries** (scriptc's lane — barely started, a Vercel Labs experiment); **WasmGC output** (Wasmnizer-ts's lane — "do not use in production", weakly held); **a two-mode compiler with a real JS story** (Stator's differentiator: nobody serves "strict TS binaries *and* your existing untyped JS in one tool"); or another concrete gap written down with evidence.
3. Confirm embedding isn't sufficient: if the real requirement is "users can script my app," **stop — embed a JS engine** (QuickJS-NG: hours of work, ~1.3 MB, <300 µs startup) or use WASM plugins (Zed/Lapce model). The compiler is only justified by: typed-code performance no interpreter reaches, tiny standalone binaries, or JIT-banned platforms.
4. Present `NICHE.md` to the human owner. **An agent must not self-approve this gate.**
5. On explicit human approval: commit, tag `phase-0-approved`.

**Check (machine-verifiable, and re-runnable at any later HEAD):** `NICHE.md` exists with the three
required elements (a human read of the file, recorded in `done.md`), and
`git cat-file -e phase-0-approved:NICHE.md` exits 0 — which fails unless the tag resolves *and* the
commit it names carries the file. The stronger form, if the provenance is ever doubted:
`git log --diff-filter=A --format=%H phase-0-approved -- NICHE.md` equals
`git rev-parse phase-0-approved^{commit}`, i.e. the tagged commit is the one that ADDED the file.

> Not `git describe --tags --exact-match HEAD`, which this Check used to specify. That asks "is HEAD
> the approval commit", which was true for exactly one commit and has been false ever since — a
> closed gate reporting itself open at every later HEAD (plan-notes 135).

---

## 4. Phase 1 — Bootstrap and specifications ✅ COMPLETE (2026-08-29)

All four tasks done, both Checks passed. **Evidence: [done.md](done.md) → Phase 1.** Deviations are
logged in `plan-notes.md` (entries 1–20). Titles stay here so `§4 Task 1.N` references resolve:

- ~~**Task 1.0** — Bootstrap the TypeScript workspace.~~ ✅
- ~~**Task 1.1** — Write `docs/SUBSET.md`: the feature × mode matrix.~~ ✅
- ~~**Task 1.2** — Write `docs/MODES.md`.~~ ✅
- ~~**Task 1.3** — Write `docs/DIAGNOSTICS.md`.~~ ✅
- ~~**Task 1.4** — Decision tests + conventions.~~ ✅

**Open follow-up:** the Node pin is **26.7.0**, which satisfies "≥ 24" but may be Current rather than
LTS — owner to confirm or drop to 24.x (notes #9). It is the differential ground truth, so settle it
before Phase 6's fuzzing leans on it. (The "nothing is committed yet" follow-up is closed: the tree
has been committed since 2026-08-30. **Phase 0 is now closed too** — `NICHE.md` was approved by the
owner on 2026-09-01 and its commit is tagged `phase-0-approved`, so the §15.1 exception that let
Phase 1 run ahead of it no longer has anything to except.)

The **locked `tsconfig.json`** this phase produced is normative and lives here, not in `done.md`
(§15.7 — changes require a plan edit):

   ```json
   {
     "compilerOptions": {
       "strict": true,
       "noUncheckedIndexedAccess": true,
       "exactOptionalPropertyTypes": true,
       "noImplicitOverride": true,
       "noFallthroughCasesInSwitch": true,
       "noUnusedLocals": true,
       "noUnusedParameters": true,
       "isolatedModules": true,
       "verbatimModuleSyntax": true,
       "erasableSyntaxOnly": true,
       "allowImportingTsExtensions": true,
       "rewriteRelativeImportExtensions": true,
       "module": "nodenext",
       "moduleResolution": "nodenext",
       "target": "es2023",
       "lib": ["es2023"],
       "types": ["node"],
       "rootDir": "src",
       "outDir": "dist",
       "sourceMap": true,
       "skipLibCheck": true
     },
     "include": ["src"]
   }
   ```
   (`erasableSyntaxOnly` bans `enum`/`namespace`/parameter properties in our own source — required for Node's type stripping and house style anyway: use `const` objects + union types. The two `*ImportExtensions` flags are what let one source tree both run under Node's type stripping in dev — where relative imports must name the real `.ts` file — and emit runnable JS into `dist/`; see `plan-notes.md` 2026-08-29 #3.)
   A second project, `tests/tsconfig.json`, extends this one (`noEmit`, `rootDir: "."`) to cover `tests/**/*.ts`, excluding the deliberately-invalid fixture directories (`subset/subset_*`, `golden/ts`, `golden/js`, `differential`). It exists because the locked config above is `src`-only, which leaves test sources unchecked. It adds no leniency.
   The Biome config (`biome.json` — format checking folded into `lint`, warnings escalated), the `src/` skeleton (whose `build`/`explain` report honest not-implemented diagnostics), the justfile, the npm scripts, `.github/workflows/ci.yml`, and `./ci.sh` (the CI until a remote exists) are all in place — the files themselves are now the reference; AGENTS.md carries the command list.

---

## 5. Phase 2 — Walking skeleton, end to end ✅ COMPLETE (2026-08-29)

Smallest full pipeline (`ts` mode only), shipped before making any part good. **Evidence:
[done.md](done.md) → Phase 2.** Titles stay here so `§5 Task 2.N` references resolve:

- ~~**Task 2.1** — Write `docs/VALUE.md` first.~~ ✅
- ~~**Task 2.2** — Micro-frontend.~~ ✅
- ~~**Task 2.3** — Micro-HIR + verifier.~~ ✅
- ~~**Task 2.4** — C emitter + driver.~~ ✅
- ~~**Task 2.5** — Runtime v0 (C11).~~ ✅
- ~~**Task 2.6** — Golden-test harness.~~ ✅
- ~~**Task 2.7** — CI hardening.~~ ✅

---

## 6. Phase 3 — Typed HIR and the lowering ladder ✅ COMPLETE (2026-08-30)

Every task and all eight rungs of the ladder landed; the phase exit ran a 477-line five-module
transit route planner byte-for-byte against Node. **Evidence: [done.md](done.md) → Phase 3.** Titles
stay here so `§6 Task 3.N` references resolve:

- ~~**Task 3.1** — HIR design doc (`docs/HIR.md`).~~ ✅
- ~~**Task 3.2** — `docs/NUMERIC.md` — numeric semantics contract.~~ ✅
- ~~**Task 3.3** — The lowering ladder.~~ ✅ — rungs: 1 arithmetic · 2 strings + template literals ·
  3 control flow · 4 functions + closures (4a calls, 4b captures) · 5 arrays · 6 classes (6a layout,
  6b accessors/override/statics) · 7 `Map`/`Set` · 8 `for`-`of`.
- ~~**Task 3.4** — Monomorphization.~~ ✅
- ~~**Task 3.5** — Boundary-check insertion.~~ ✅
- ~~**Tasks 3.6–3.9** — Optimization passes v0 (const-fold, DCE/tree-shake, inline).~~ ✅
- ~~**Task 3.10** — Exception unwinding.~~ ✅
- ~~**Task 3.11** — Modules.~~ ✅
- ~~**Task 3.12** — Tree-shaking builtins.~~ ✅

---

## 7. Phase 4 — Runtime v1 ✅ COMPLETE (2026-09-01)

All seven tasks landed and the phase's exit criterion — added mid-flight because the phase had a
Check but no scope boundary (plan-notes 116) — is met on every bullet. `pnpm run ci` green:
319 unit tests, 272 subset fixtures (209 passed, 63 expected-fail, 0 failed), **93 golden fixtures
byte-for-byte against the pinned Node under both the release and the ASan/UBSan runtime**, the
10M-object leak loop plateauing at 3.0 MB RSS, and the builtins dashboard rendering.
**Evidence: [done.md](done.md) → Phase 4.** Titles stay here so `§7 Task 4.N` references resolve:

- ~~**Task 4.1** — Objects.~~ ✅ — shapes, inline caches, and the array-with-properties slice.
- ~~**Task 4.2** — Builtins, driven by golden tests.~~ ✅ — `Math`, `JSON`, `String.prototype`,
  `Array.prototype`, `Object`, `Map`, `Set`, `console`, `Date`. A builtin counted as implemented
  when ≥1 golden test exercised it and matched Node, with a **determinism carve-out** for members
  that cannot match by construction (`Math.random`, `Date.now`, zero-argument `new Date()`,
  `console.time`/`timeEnd`/`trace`), which prove by shape assertion in `tests/unit/` instead.
- ~~**Task 4.3** — RegExp.~~ ✅ — QuickJS-NG `libregexp` vendored; `libunicode` paid `toUpperCase`/
  `toLowerCase`/`normalize`'s debt with it.
- ~~**Task 4.4** — Intl/ICU.~~ ✅ — a feature build (`just runtime-intl`), off by default.
- ~~**Task 4.5** — GC hygiene tests.~~ ✅
- ~~**Task 4.6** — `async`/`await`.~~ ✅ — generators split off to Phase 5 step 8, which owns the
  iterator protocol they actually wait on.
- ~~**Task 4.7** — Audit every not-yet phase pointer.~~ ✅ — and it is why this phase could close
  honestly: 165 sites re-derived, 70 of which named a phase that had been complete for six days,
  every one now naming the phase that owns its blocker, with `tests/unit/phases.test.ts` failing
  the build if that ever stops being true (plan-notes 136, §15 rule 9).

**What is still missing from the dashboard is missing on purpose**, and each residue names its
owner: `Object`'s `freeze`/`isFrozen` and the `Promise` prototype → Phase 5 step 11;
`keys`/`values`/`entries`, `for`-`of` over non-arrays, `function*` and `String.prototype.matchAll`
→ Phase 5 step 8; the descriptor/prototype surface and `RegExp.prototype.compile` → Phase 8; the
five ICU-dependent `Date` string forms → the intl feature build, which is a flag rather than a
phase. The dashboard counts MEMBERS, not blockers, so a percentage below 100 is not open work
(plan-notes 125).

---

## 8. Phase 5 — `js` mode, and the language surface Phases 3 and 4 deferred (est. +4–6 weeks; needs Phase 4's shapes/ICs)

Until here, every pipeline stage was built `ts`-mode-first but mode-agnostic below the gate (§0.8). This phase turns on the second policy.

The title gained its second half on 2026-09-01 (plan-notes 116) and its "3 and" on the same day
(plan-notes 136). Steps 8–12 are not `js`-mode work: they are language surface that needs one more
mechanism, which an earlier phase deferred without naming an owner. They are here because the
mechanism each one waits on is **lowering** work, not runtime work, and Phases 3 and 4 closed on
the rungs and the runtime respectively, not on the surface they deferred.

**Split trigger (armed 2026-09-01, plan-notes 136).** The earlier wording — *"if this phase starts
feeling like a bucket"* — was a feeling, and step 12 arrived carrying 70 gate sites on its own, more
than steps 8–11 combined. Feeling is now replaced by a condition: **split steps 8–12 into their own
phase the moment step 12's construct families stop landing as one dependency chain** — concretely,
when two of its families are being worked by different people at once, or when the step's own Check
has to be split to report progress. Do it by plan edit (§15.3), not by drift, and take a new phase
NUMBER rather than renumbering 6/7/8, which `plan.md §N` citations in code comments and `docs/`
depend on.

Steps (1–11 detailed 2026-09-01 against the live substrate — much of step 1 is already real;
plan-notes 131. Step 12 was added the same day from Task 4.7's inventory; plan-notes 136):
1. ~~Frontend: `allowJs` + `checkJs`-style inference in the `ts.Program`; per-function
   "typed | inferred | dynamic" provenance recorded into HIR.~~ ✅ **landed** — the substrate
   (`program.ts` wiring `allowJs`/`checkJs` by mode, HIR's `provenance` field, `explain`'s
   per-function `verdict (provenance)` row), the `inferred` middle grade in `provenanceOf`
   (`5e9f2b4`, 2026-08-31 — this step's "Remaining" clause was written a day AFTER the thing it
   asks for), and the `explain --json` grade matrix in `tests/unit/cli.test.ts` (2026-09-01).
   **The grade answers what the AUTHOR wrote, not which file it lives in** (plan-notes 140):
   `typed` is a signature annotated whole in either spelling — `x: number` and `@param {number} x`
   are the same claim by the same author — `inferred` is one the checker finished, and `dynamic` is
   one holding an `Unknown`, which outranks both because an un-annotated `.js` parameter is not an
   omission the checker happened to solve, it is the request for a dynamic value. This step
   previously graded a fully JSDoc'd `.js` function `inferred`; that reading collapses the
   annotated/un-annotated split INSIDE `.js`, which is the only split js mode trades on, and the
   `.ts`/`.js` distinction it was reaching for is already in the report's own file path.
2. ~~Gate: switch the diagnostic table by mode. Concretely: (a) `any`/`as any` in `js` mode stops
   being `STA1001` and lowers to `Unknown` (the dynamic path) — decision tests asserting the SAME
   source flips verdict by mode; (b) `var` becomes legal in `js` mode only (its `ts`-mode "never"
   code is untouched); (c) `.js` acceptance is already real (the `js` golden fixtures compile
   today) — pin the other direction with a decision test that a `.js` entry under `ts` mode stays
   `STA1002` with the "use `--mode=js`" hint; (d) `eval`/`new Function` in `js` mode emit
   **`STA1206`** — allocated in DIAGNOSTICS.md but emitted NOWHERE in src/ today — as not-yet
   naming Phase 8; `ts` mode keeps `STA1101`/`STA1103` never.~~ ✅ **landed** (2026-09-02) —
   (a) the same source (`const x: any = 42`, `const x = 1 as any`) is `STA1001` in ts and
   `dynamic` in js (`subset_explicit_any_*`, `subset_as_any_*`); `as any` is explicit, not
   implicit `STA1003`; (b) `var` was already split (`STA1104` never / `STA1214` not-yet) — the
   lowering is step 3; (c) a `.js` entry under ts is `STA1002` with the `--mode=js` hint
   (`subset_js_file_ts.js`, `tests/unit/cli.test.ts`) — `allowJs` is now on in both modes so tsc
   does not drop the file and answer `STA0012`; (d) `eval`/`new Function`/`Function(...)` emit
   `STA1101`/`STA1103` never in ts and `STA1206` not-yet Phase 8 in js. Three findings, plan-notes
   141.
3. ~~Lower `var`: function-scoped binding, hoisting to the enclosing function (or module) scope,
   `undefined` init before the first statement runs, legal redeclaration folding to one slot.~~
   ✅ **landed** (2026-09-02) — desugars to a function-scoped `let` initialized `undefined` plus
   an assignment at the original site, so HIR gained no third `declKind`. A `var` that repeats a
   parameter or a function declaration shares that slot (no second `undefined` init). Capturing a
   loop `var` is the ordinary shared binding; capturing a loop `let` stays not-yet. checkJs's
   "used before assigned" still rejects the classic `console.log(x); var x = 1` spelling as
   `STA0012`; the golden proves the runtime fact via `var x; console.log(x); x = 1`, and the
   lowering unit test pins the source-order desugaring. plan-notes 142.
4. ~~Dynamic lowering completion.~~ ✅ **landed** (2026-09-02) — (a) Unknown (and empty `{}`)
   property get/set lower to the existing dyn-field nodes; computed index emits
   `jsrt_dyn_index_get`/`set` (arrays stay dense; everything else ToString's the key into the
   shape table); `o.m(...)` on Unknown is a get then a call. (b) `jsrt_call_at` raises
   `STA2006` at `file:line` for a non-function; arity padding is `jsrt_arg`; ordinary functions
   do not take `this` as argv[0], so the receiver is not prepended. (c) `==`/`!=` was already
   `jsrt_loose_equals` (NUMERIC.md §6.3.1); `tests/golden/js/to-primitive.js` pins the table.
   STA2004 now only fires when a fixed layout is asked to *grow*; an aliased read of an
   existing field answers. STA4058 retired. plan-notes 143.
5. ~~Mixed-graph boundaries.~~ ✅ **landed** (2026-09-02) — a dynamic (Unknown) value reaching a
   checkable annotation is wrapped in `BoundaryCheck` at the EDGE: declaration, assignment, call
   argument, and return. The key is the edge, not provenance (plan-notes 140, 144). A lying JSDoc
   is still `STA0012` at compile time; the trap is an untyped `.js` identity (`wrap(x){return x}`)
   assigned to `const n: number` in a `.ts` importer, which aborts `STA2001`. Happy path is
   `tests/golden/js/mixed_graph/` (`.ts` entry importing `.js`). The trap is a CLI native test,
   the same pattern as STA2004/STA2006 — an expected-stderr golden mode would duplicate it.
6. ~~JSDoc freebie test.~~ ✅ **landed** (2026-09-02) — a fully JSDoc'd `.js` module reports file
   verdict `static` with provenance `typed` (`tests/unit/cli.test.ts`); `tests/golden/js/jsdoc_static.js`
   matches Node on the static path. No compiler change: `hasUnknown` was already the file rollup,
   and JSDoc is `typed` since step 1 (plan-notes 140).
7. ~~Flip remaining js expected-fail + capstone golden.~~ ✅ **landed** (2026-09-02) — twelve
   js-column fixtures whose constructs already compiled (arithmetic, bitwise, comparison, unary,
   template, switch, let/const, loose `==`, number/string, `if`, `??`) dropped `@expected-fail`
   with honest verdicts (typed literals are `static`; untyped `if`/`??` are `dynamic`). Remaining
   expected-fail wait on their owner steps (rest/destructure → 12, iterators → 8, `import()` → 10,
   …), never bulk-flipped. Capstone `tests/golden/js/capstone.js` is an untyped catalog (~200
   lines) matching Node. `var xs = []` taught `hTypeAssignable` to recurse into arrays (plan-notes
   146).
8. **The iterator protocol, and generators with it** — in progress: `docs/VALUE.md` §4.13 is written; `for-of` over a string is a specialized code-point loop (plan-notes 147) and `for-of` over a Map or Set is a live insertion-order walk (plan-notes 148). The nine `keys`/`values`/`entries` members landed (plan-notes 150); `matchAll` landed (plan-notes 151); `function*` landed (plan-notes 152); `.return()`/`.throw()` on the generator object landed (plan-notes 153). Remaining: `for-of` over a user iterable (**`STA1214`**, needs `Symbol` as a value). (inherited from Task 4.6, which delivered `async`/`await` and deferred the rest — see plan-notes 112). One blocker, **four** surfaces: `for`-`of` over a user iterable (string/`Map`/`Set` already specialized — **`STA1214`** now names only the protocol-object case, not the specialized loops), the `keys`/`values`/`entries` triple (landed), `String.prototype.matchAll` (landed — a boxed iterator of match arrays), and `function*` (landed — **`STA1201`** now names generator methods, async generators, and `for await`). A `yield` differs from an `await` in who it answers (its caller, not a scheduler), not in how it suspends.
   In order: (a) the representation decision FIRST, in `docs/VALUE.md` — compile-time-known
   iterables (string, array, `Map`, `Set`) lower to SPECIALIZED loops with no protocol object
   allocated (the AOT-friendly path); only a user iterable (a `[Symbol.iterator]` the checker can
   see) gets a real protocol object, and its struct shape is written down before any code;
   (b) the nine `keys`/`values`/`entries` members (Array/Map/Set × 3) landed on that representation
   and flipped their dashboard triples; (c) `for`-`of` over string/`Map`/`Set` is done, user iterables
   still narrow `STA1214`;    (d) `matchAll` landed (plan-notes 151); (e) `function*` landed on Task 4.6's
   suspension state machine with caller-driven resume (plan-notes 152): `next(v)` injects into `yield`;
   (f) `.return(v)`/`.throw(e)` landed as an injection the resume prologue reads at the parked
   label (plan-notes 153) — and landing them exposed that NO compiler-introduced C local survives
   a suspension, so the try/finally completion code became a counted slot and suspendable units
   box every specialized for-of into the heap iterator. User-iterable `for-of` still needs
   `Symbol`.
9. **Top-level await** (**`STA1208`**, moved here from Phase 4 on 2026-09-01). The gate's message
   already names the blocker exactly — "a module body has no resume point to suspend into" — and
   Task 4.6 built resume points for functions. This step makes the module init function an async
   unit, which also forces the question the whole-program model has so far avoided: what a
   suspending module body means for the topological init order Task 3.11 established.
   In order: (a) answer the ordering question BEFORE coding, with a differential fixture — the
   spec permits sibling-subgraph concurrency and Node implements it, so measure what Node
   actually interleaves, then decide (and record in `docs/MODES.md`) whether Stator awaits
   dependency init promises strictly in Task 3.11's topological order (simpler, observably
   different only in sibling interleavings) or mirrors Node; (b) make the module init function an
   async unit on Task 4.6's resume points; (c) goldens where the order is observable (a TLA
   module plus siblings that log during init). `STA1208` clears here.
10. **Dynamic `import()`** (**`STA1207`**, moved here from Phase 4 on 2026-09-01). Its old note said
   it "cannot land before async/await"; async landed and it did not, because the real blocker is a
   **module namespace object** — an object whose shape is the module's export list. With a LITERAL
   specifier the target is already in the whole-program graph, so this is shape work plus an
   already-resolved promise, and it belongs here. With a COMPUTED specifier it needs runtime module
   resolution the whole-program model does not have: that half is Phase 8, and the split needs owner
   confirmation before either half is built.
   In order: (a) the module namespace object — an object whose shape IS the export list, already
   whole-program-known, sealed, reads flowing through the live bindings; (b) literal-specifier
   `import()` answers an already-resolved promise of that namespace (consuming it with `await`
   works the day this lands; consuming it with `.then` waits on step 11); (c) the computed half
   stays split for Phase 8, unchanged, pending owner confirmation.
11. **`Promise.prototype.then`/`catch`/`finally` and `new Promise(executor)`** (**`STA1216`**,
   already assigned here). Both wait on the same thing: a handler's throw must become a rejection,
   which needs a runtime-level catch around user code.
   In order: (a) the MECHANISM first, and in `docs/VALUE.md` before any member — but as an
   EXTENSION of §4.9's existing pending-cell protocol, not a new one beside it. §4.9 already has
   `jsrt_throw` / `jsrt_pending` / `jsrt_take_exception`; what it gives to GENERATED code (check
   the flag after every call that can run user code, jump to the nearest landing pad) is exactly
   what a builtin cannot do today, which is `STA1216`'s recorded blocker in `docs/DIAGNOSTICS.md`
   ("the pending-exception protocol gives that catch to generated code, not to a builtin"). So the
   doc gains a subsection: a runtime-side call that invokes a user closure, checks `jsrt_pending()`
   on return, takes the exception, and yields it as a COMPLETION VALUE to the builtin — which then
   settles a promise with it instead of unwinding into library C. Reuse the vocabulary §4.9 already
   defines; a second name for one mailbox is how two protocols get built by accident;
   (b) `then`/`catch`/`finally` on Task 4.6's
   microtask machinery, handler throws becoming rejections via (a); (c) `new Promise(executor)`,
   the executor running protected the same way; (d) the unlock sweep in the same change:
   `Object.freeze`/`isFrozen` (the exit criterion moved them here), `toISOString` on an Invalid
   Date, and every `SUBSET.md` row reading "the spec throws, which builtins cannot raise yet" —
   those rows are IOUs written against exactly this step, so grep for them and close or re-date
   them; (e) `STA1216` clears; then enumerate the `Promise` combinator residue
   (`allSettled`/`any`/`race`/`withResolvers`/`try`) and name each member's owner — most need
   only (a); iterating a non-array argument also needs step 8.
12. **The lowering ladder's residue — `ts`-mode static language surface** (added 2026-09-01,
    plan-notes 136). Phase 3's rungs each landed a core and deferred its surface under
    `notYet(…, 3)` while Phase 3 was open; Phase 3 closed on 2026-08-30 having passed a Check about
    the eight rungs, not about what they deferred, and **70 gate sites outlived their owner** —
    still telling users, today, that rest parameters are "planned for Phase 3". This step owns
    them. It is not `js`-mode work and not the dynamic tier: every construct here is typed
    TypeScript with a statically known shape, which §1.1 promises will "eventually compile", in the
    product's DEFAULT mode. Land by family, each family flipping its `tests/subset/` rows out of
    expected-fail in the commit that lands it, never in bulk:
    (a) **Parameter and binding forms** first, because every later family calls functions: rest,
    default, optional and destructuring parameters; destructuring declarations; a declaration
    without an initializer; destructuring a caught value.
    (b) **Expression-position residue** next — cheap, and it unblocks the decision corpus: labels
    on anything but a loop or switch, capturing a variable declared inside a loop, `instanceof`
    against anything but a class name, assignment and compound assignment to a non-variable,
    `++`/`--` on a non-variable and in value position, and the binary/unary/statement catch-alls
    (`describeKind`).
    (c) **Object literal forms**: shorthand, spread, method and accessor members; keys that are not
    identifiers.
    (d) **The class member surface** — the largest family, and the reason rung 6 shipped as 6a/6b:
    static getters and setters, accessors with no body, computed and `#private` accessor names,
    index signatures, static initialization blocks, computed member names, a `#private` name an
    ancestor also declares, constructor and method overload signatures, a derived constructor that
    does not open with `super(...)`, more than one constructor, optional methods and fields, the
    override rules, anonymous classes, and the `extends` forms. The `this`/`super`/`new` position
    sites ride here (`this` in a static member or outside a class member; `super` on anything but
    an inherited method; `new` on anything but a named class).
    (e) **Values that need a closure or a class object**: bound method values (`const f = o.m` —
    the sites' own comments already name the blocker, "a bound closure nothing here builds"), a
    class used as a value, `super` as a value, named function expressions, function declarations
    inside a block/loop/branch, calling a class field, and calling an arbitrary expression. Decide
    the bound-method REPRESENTATION in `docs/VALUE.md` before writing any of it — this family is
    where an accidental second closure representation gets built.
    (f) **Generics beyond monomorphization** last, because they multiply everything above:
    constrained and defaulted type parameters, generic classes, generic function expressions and
    arrows, a generic function used as a value, explicit type arguments on a call or a `new`, and a
    generic call whose type arguments no argument determines.
    **Check (step 12):** one golden fixture per family matching the pinned Node byte-for-byte; the
    decision-test rows for every construct named above out of expected-fail; and `gate.ts` emits no
    `not-yet` for any construct this step names.
**Check:** a mixed graph (typed `.ts` entry importing an untyped `.js` lib) compiles under `--mode=js` and matches Node byte-for-byte; a `js`-only program using `var`/hoisting/`==` matches Node; `stator explain` shows static/dynamic split per function; `ts`-mode behavior and binary sizes unchanged (regression-checked against Phase 3 baselines).

---

## 9. Phase 6 — Conformance and differential fuzzing (starts after Phase 3; Test262 needs Phase 5; then forever)

This phase produces no language features. It produces **evidence** — a conformance number, a
divergence hunt, and measurements — and its output is only as good as its honesty, so every step
below is written against one failure mode: a green signal that proves less than it appears to. A
skipped test counted as a pass, a fuzzer that generates programs the compiler already handles, a
benchmark of the wrong answer computed quickly. Each step names the dishonest version it exists to
prevent.

The three tasks are independent and can be built in any order (6.2 can start right after Phase 3;
6.1 needs Phase 5 because Test262 is `.js`). The phase's Check has one clause per task.

**Task 6.1 — Test262 runner** (`js` mode — Test262 files are `.js`; `ts`-mode conformance is carried by decision/golden suites). The runner reads each test's `features:` frontmatter and skips any feature not in the subset matrix; skipped tests are **counted and reported by feature** (`450 passed, 120 skipped (async: 80, proxy: 40), 5 failed`), never silently dropped. The % is CI-visible on every commit (Porffor's model — conformance as the public heartbeat).

Steps (detailed 2026-09-01; plan-notes 131):
1. **Corpus acquisition, under the no-network constraint.** `tc39/test262` is ~50k files — too
   large to vendor, and this environment cannot fetch it (plan-notes 28, the same constraint that
   deferred Ryū). So the repo holds the RUNNER, not the corpus: `tests/test262/` gets `run.ts`,
   `features.ts`, `pin.json` (the corpus commit SHA — a conformance % against an unpinned corpus is
   not a tracked number), and a `fetch.ts` that shallow-clones the pinned SHA into a git-ignored
   `tests/test262/corpus/`. Resolution order for the corpus path: `$STATOR_TEST262`, then the
   git-ignored default. **Missing corpus SKIPS with a message naming the fetch command — never
   fails** — so `pnpm run ci` stays runnable offline; the skip must be visible in the output, since
   a silently-skipped conformance suite is the dishonest version of this whole task.
2. **Frontmatter parser** (~40 lines, no dependency): the `/*---` … `---*/` block is a fixed subset
   of YAML — `esid`, `features`, `includes`, `flags`, `negative`, `locale`. Parse exactly those
   keys and **hard-error on an unknown key** rather than ignoring it; an unrecognized key is how a
   corpus bump silently changes the meaning of a test.
3. **Harness adapter.** Each test is `harness/assert.js` + `harness/sta.js` + every file named in
   `includes:` (`compareArray.js`, `propertyHelper.js`, …), concatenated ahead of the test body,
   then compiled as one `js`-mode unit. `flags: [raw]` means no harness and no strict wrapper;
   `onlyStrict`/`noStrict`/`module`/`async` each change how the file is built and run
   (`async` tests print `Test262:AsyncTestComplete` and need Task 4.6's microtask drain). Flags
   the adapter does not implement are a SKIP with the flag as the reason, counted like any other.
4. **Negative tests.** `negative: {phase, type}` inverts the verdict: for `phase: parse` or
   `resolution`, a Stator **compile-time diagnostic** is the pass — but only if it is the right
   error, so one table maps `STA` codes to spec error classes (`SyntaxError`, `ReferenceError`,
   `TypeError`), and a diagnostic outside the table fails the test rather than passing it by
   accident. A `not-yet` (`STA12xx`) diagnostic on a negative test is **not** a pass: it is a skip
   attributed to that code. For `phase: runtime`, the built binary must exit nonzero naming that
   error class.
5. **Feature → subset mapping** (`features.ts`): each Test262 feature tag maps to
   `supported | not-yet(STAxxxx) | never(row in docs/SUBSET.md)`. **An unmapped tag is a runner
   error, not a skip** — that is the tripwire that makes a corpus bump introduce new tags visibly
   instead of quietly inflating the skip bucket. Rows must cite `SUBSET.md`, which stays the
   authority (§15.6): the mapping table points at rows, it does not invent them.
6. **Reporting.** Human line exactly as the task states, plus machine-readable
   `tests/test262/results.json` (per-feature counts, per-test verdicts). Print **both** the
   pass rate over `passed + failed` and the raw skip count on the same line: a percentage computed
   with skips excluded is meaningful only when the skip count is next to it, and quoting one
   without the other is how conformance numbers become marketing.
7. **Ratchet, which is what "monotonically tracked" means.** `tests/test262/ratchet.json` records
   `{passed, failed, skipped}` at the pinned SHA; the runner fails if `passed` drops or `failed`
   rises. Known failures live in `tests/test262/expected-fail.txt` as `path # reason` where the
   reason is an `STA` code or a `SUBSET.md` row — and **an unexpected PASS in that list also
   fails**, because a stale expectation list is the same drift as a stale plan (§15.3). Updating
   the ratchet is a deliberate commit, never a side effect of a test run.
8. **CI heartbeat.** A `test262` job in `.github/workflows/ci.yml`, one platform only
   (`ubuntu-24.04`) — conformance is host-independent, and the existing matrix already proves
   portability. Cache the corpus keyed by `pin.json`'s SHA. The summary line goes to
   `$GITHUB_STEP_SUMMARY` so the number is visible without opening logs. `pnpm run test262` is NOT
   added to `pnpm run ci` (that chain must stay offline-runnable, per step 1); the CI job is what
   makes it per-commit.

Satisfies the Check's first clause (% visible and monotonically tracked) via steps 6–8.

**Task 6.2 — Differential fuzzing.** Generate random programs within the subset (grammar-based generator first, coverage-guided later) — typed programs for `ts` mode (can start right after Phase 3), untyped for `js` mode; run compiled vs pinned Node, diff outputs. Every divergence becomes a golden test.

Steps (detailed 2026-09-01; plan-notes 131):
1. **Create `tests/differential/`.** `AGENTS.md`'s repo map already names it ("fuzzer corpus") and
   the directory does not exist — the map describes the target state. It gets `generate.ts`,
   `minimize.ts`, `run.ts`, and `corpus/` (committed seeds that once diverged).
2. **Determinism before generation.** A ~10-line seeded xorshift PRNG, and NO other entropy source
   anywhere in the generator (no `Date.now`, no `Math.random`). Every run prints its seed; every
   run is reproducible from `--seed=N` alone. A fuzzer whose findings cannot be replayed produces
   bug reports nobody can act on, which is worse than no fuzzer.
3. **Type-directed generation, not text generation.** Choose the type first, then build an
   expression that inhabits it — so the program compiles **by construction**. This is the step that
   decides whether the fuzzer is useful: a generator that emits raw JS spends its whole budget
   rediscovering that unsupported syntax is unsupported. Consequence to hold firmly: a generated
   program that fails to compile is a **generator bug** and the generator gets fixed — unless the
   diagnostic is `STA4xxx` (internal error), which is a real finding — an exception reaching the
   CLI is always a compiler bug (`AGENTS.md`'s diagnostics conventions).
4. **Weight the grammar toward what the golden suite cannot enumerate**, because everything else is
   already covered by fixtures: float formatting and the shortest-round-trip boundary
   (`docs/NUMERIC.md`), the `i32` refinement's overflow edges, string indexing across surrogate
   pairs, `Map`/`Set` key identity (`-0`, `NaN`), and — once Phase 5 lands — coercion order in `==`.
   These are the regions where a divergence is a semantics bug rather than a typo.
5. **Oracle.** Compile and run, then run the same source on the pinned Node from `.node-version`
   (and only that Node — the differential ground truth is the pinned one, `AGENTS.md`'s testing
   rules). Compare stdout **byte-for-byte** and exit status; a timeout counts
   as a divergence (an infinite loop in emitted code is a bug, not a slow test). Never normalize
   output to make a comparison pass — the golden-test rule (`AGENTS.md`) applies here identically.
6. **Minimizer.** Delta-debug: drop statements, then shrink subexpressions, keeping only reductions
   that preserve the divergence, until nothing can be removed. Report the minimized program, its
   seed, both outputs, and the first differing byte offset.
7. **Every divergence becomes a golden test, in the commit that fixes it.** The minimized program
   goes to `tests/golden/ts|js` with a header comment carrying the seed and the date; the raw
   pre-minimization program goes to `tests/differential/corpus/`. Fixing the bug without landing
   the fixture is how the same divergence returns.
8. **`js`-mode arm after Phase 5.** Same generator, untyped output, plus weights for `var` hoisting,
   loose equality, and dynamic property access — the three places `js` mode can disagree with Node
   in ways `ts` mode structurally cannot.
9. **Nightly job.** The repo has no scheduled workflow yet; add `.github/workflows/nightly.yml`
   with a `schedule:` cron running `--minutes=60`. Derive the starting seed from
   `github.run_number` (**not** the clock) so any nightly run can be replayed exactly. On
   divergence: fail the job and upload the minimized program plus both outputs as an artifact.

Satisfies the Check's second clause (≥1 h nightly, zero unexplained divergences) via steps 5–9.

**Task 6.3 — Benchmark harness** (weekly, results committed): startup time, binary size, RSS, and a compute set (fib, nbody, JSON round-trip, string churn) vs Node, Bun, QuickJS, and — where installable — Perry/scriptc/Static Hermes. Record version, flags, and hardware with every number. **Never quote a competitor's self-published figure as a measurement.**

Steps (detailed 2026-09-01; plan-notes 131):
1. **Extend `tests/bench/record.ts`; do not replace it.** It already exists from Task 2.7 and
   already gets the hard parts right — best-of-5 (the minimum is the one number a scheduling hiccup
   cannot inflate), and a `baseline.json` that stamps host, CPU, Node, clang, and the `-O2` flag
   string. What it measures today is only COMPILE time and binary size over `tests/golden/ts`. This
   task adds run-time measurement, a program set, and other engines onto that existing shape.
2. **The compute set is its own directory** (`tests/bench/programs/`): fib, nbody, JSON round-trip,
   string churn. They are deliberately NOT golden fixtures — they run for seconds and the golden
   suite must stay fast — but **each is verified against Node once at record time**, and a
   mismatch aborts the recording. A benchmark that computes the wrong answer quickly is not a data
   point, and this is the only guard against that.
3. **Metrics per program:** startup floor (an empty program, which is what separates "our binary
   starts fast" from "our fib is fast"), wall-time best-of-N via the existing rule, peak RSS, and
   binary size. RSS has a portability trap worth naming in the code: `ru_maxrss` is **kilobytes on
   Linux and bytes on macOS**. Normalize to bytes and record the raw value beside it, or the first
   cross-platform comparison silently reports a 1000× regression.
4. **Competitor matrix by discovery, never by assumption.** Probe `node`, `bun`, `qjs` (and
   Perry/scriptc/Static Hermes where installable) on `PATH`; record each engine's **own** version
   string. An engine that is absent is recorded as `"absent"` — never omitted — because an omitted
   row and a slow row look identical in a results file six months later. `AGENTS.md`'s rule stands
   above all of this: a competitor number that was not produced by this harness on this machine is
   not a measurement and does not go in the file.
5. **Results layout.** `baseline.json` stays the machine-local reference it already is; runs land in
   `tests/bench/results/<ISO-date>-<host-id>.json`, appended, never overwritten. The "benchmark
   page" of the Check is `tests/bench/README.md`, **generated** from the newest results file per
   host — "auto-updates" means generated and committed by a job, not hand-maintained prose.
6. **Weekly job**, sharing `nightly.yml` from Task 6.2 with a different cron. Default to uploading
   the results file as an artifact and writing the summary to `$GITHUB_STEP_SUMMARY`. Committing
   results back to `main` from CI is a repo-policy decision for the owner — record the answer in
   `plan-notes.md` before wiring it, either way.
7. **Perf-regression gate** (§12's standing practice, which has no home until this harness exists).
   Compare against the previous results file **for the same host** and fail on a geomean regression
   beyond a threshold. Measure the threshold before setting it: record the same commit twice, take
   the observed spread, and set the gate above it. A gate below the noise floor fires on noise, and
   an alarm that fires on noise is one people learn to ignore — which costs more than having no
   gate at all.

Satisfies the Check's third clause (benchmark page auto-updates) via steps 5–6.

**Check:** Test262 % visible and monotonically tracked; fuzzer runs ≥1 h nightly with zero unexplained divergences; benchmark page auto-updates.

---

## 10. Phase 7 — FFI (est. +4–6 weeks)

Research verdict: only Static Hermes has bidirectional, header-driven FFI — and even there the binding generator is an experimental in-tree script. A differentiator worth building properly; emitting C makes it natural.

"Emitting C makes it natural" is true of the CALL and false of everything around it. The call itself
is a line of C. The phase is four weeks because of what surrounds it, and all four surprises are the
same shape — a thing that is implicit inside the compiled world and must become explicit at the
edge:

- **Memory.** Inside, Boehm sees every pointer because generated code keeps them in `JSRT_FRAME`
  slots. A pointer handed to C is invisible to the collector for the duration of the call, and the
  callee may keep it after returning. Every FFI signature therefore has to say who owns what and
  for how long — the compiler cannot infer it, and getting it wrong is a use-after-free, not a
  diagnostic.
- **Strings.** The runtime's strings are UTF-16 (a settled decision, §15.4); C wants bytes. There is
  no free conversion, so there is no implicit one.
- **Errors.** C reports failure by return value, `errno`, or an out-param, and it never unwinds.
  A JS exception must never propagate into a C frame, and a C error code only becomes an exception
  if the declaration says how.
- **Direction asymmetry.** 7.1 (calling out) is a compile-time question. 7.2 (being called in) is a
  runtime-lifecycle question: initialization, stack roots, threads, and what a C caller sees when
  TS throws. They share the ABI table and nothing else.

Order is 7.1 → 7.2 → 7.3 and it is not arbitrary: 7.2 reuses 7.1's type mapping in reverse, and 7.3
generates the declarations 7.1 consumes — a generator built before the shape of a hand-written
binding is known would be generating guesses.

**Out of scope for v0, stated here so it is a decision rather than an omission** (each may return as
its own task, with a `plan-notes.md` entry and a `SUBSET.md` row):

| Not in v0 | Why |
|---|---|
| Struct **by value** across the boundary | ABI-specific layout/alignment per platform and per struct; by-pointer covers the real use cases |
| Varargs (`printf`) | No sound signature; each call site is a different function type |
| C++ symbols, name mangling, exceptions | A second ABI, not an extension of this one |
| C **calling back into** a JS closure | Needs a trampoline plus a GC root for the closure that outlives the call. Task 7.2's exported functions are the supported way for C to call in |
| Threads | Single-threaded runtime; see Task 7.2 step 6 |

**Task 7.1 — Calling C from TS.** `declare` + a marker (mirroring `$SHBuiltin.extern_c`) lowers to a direct call — no boxing for primitives; ownership rules for pointers/strings documented per-signature.

Steps (detailed 2026-09-01; plan-notes 131):
1. **Decide the surface before writing lowering, and write it down first.** Nothing under
   `src/frontend/` handles ambient `declare function` today, so this is new gate surface rather
   than a tweak to an existing path. Pick the marker — a `declare function` in a `.d.ts` plus an
   explicit per-declaration marker, TS-native, rather than Static Hermes's `$SHBuiltin.extern_c`
   call form — and land it in `docs/SUBSET.md` + a new `docs/FFI.md` **before** any code. Per
   §15.6, inventing this convention in code instead of in the docs is the failure mode. Three
   sub-decisions the doc has to settle, because each becomes unchangeable once bindings exist:
   where the marker attaches (declaration, or a whole `.d.ts` file), how the C symbol name is
   spelled when it differs from the TS name, and whether an extern declaration is legal outside a
   `.d.ts` (recommend no — keeping it in declaration files is what makes 7.3's generator's output a
   drop-in).
2. **The ABI table is the contract, and it is small on purpose.** It lives in `docs/FFI.md`:

   | TS type | C type | Notes |
   |---|---|---|
   | `number` | `double` | The unmarked case; no conversion |
   | `number` + `i32` refinement | `int32_t` | The refinement already exists (`docs/NUMERIC.md`) |
   | `boolean` | `bool` | `<stdbool.h>` |
   | `void` | `void` | Return position only |
   | branded pointer type | `T*` | Opaque; never dereferenced by generated code |
   | explicit `CString`-style wrapper | `const char*` | Allocates; see step 3 |
   | anything else | — | Compile error |

   **`string` deliberately maps to nothing.** UTF-16 in, bytes out means a real conversion with a
   real allocation, so it is spelled at the declaration and never inferred. `Unknown`, objects,
   arrays, and closures are errors here by construction — they are the cases that would need
   boxing, and "no boxing for primitives" is only meaningful if the non-primitives are refused
   rather than silently boxed. Each refusal gets its own code, allocated in `docs/DIAGNOSTICS.md`
   (the sole allocator — never here).
3. **String conversion, both directions, with the lifetime written down.** In: allocate a NUL-
   terminated UTF-8 copy for the call and free it after (the callee gets a borrow; if it stores the
   pointer, the declaration must say so and the copy must be transferred instead). Out: a
   `const char*` return is copied into a runtime string at the boundary — never wrapped, because a
   wrapper's lifetime belongs to the C library and nothing in the runtime can track it. Embedded
   NULs and invalid UTF-8 need a stated answer, not an accident.
4. **Errors: C returns codes, and only the declaration knows what they mean.** Fix the policy here
   or every binding invents its own. Default: the return value is a plain value and a failing call
   is not an exception. Opt in per declaration to one of a closed set of conventions — nonzero is
   an error, negative is an error, NULL is an error, `errno` carries it — and the lowering emits
   the throw. Two absolutes: a JS exception must **never** unwind through a C frame (the call is
   made outside any construct that could throw across it), and an unmapped nonzero return must not
   be silently discarded.
5. **Lowering and the emitter.** An extern-marked call becomes a direct C call: typed values are
   already unboxed, so the work is making sure the emitter does not route them through `jsrt_value`
   on the way out, that the `#include` reaches the emitted translation unit, and that argument
   evaluation order and any temporaries (step 3's string copies) are freed on **every** exit path,
   landing pads included — the same discipline `JSRT_FRAME` already demands of generated code.
6. **GC and ownership, per signature, in the declaration.** A pointer handed to C is invisible to
   Boehm for the duration of the call; the frame that owns it must stay live across the call, and
   the callee must not retain it past return unless the declaration says it takes ownership. Two
   options only — **borrowed for the call** or **copied/transferred** — because a third would be a
   lifetime the compiler cannot express. This is documentation the compiler cannot check, which is
   exactly why it is per-signature rather than one global paragraph. A binding that keeps a pointer
   (SQLite's statement handles) uses the branded-pointer type, whose lifetime is the C library's,
   not the collector's.
7. **Link plumbing.** An extern declaration needs a header to include and a library to link.
   `linkExecutable` in `src/cli/build.ts` already assembles the clang link line (and already
   handles conditional `-lgc`), so extern-declared libraries append there; flags come from the
   declaration file plus a `--link=` CLI escape hatch. Duplicate libraries are deduplicated while
   preserving order — link order is load-bearing for static archives, and a "helpful" sort here
   breaks builds in a way that looks like a missing symbol.
8. **Name the trust boundary honestly.** §0 rule 2 says never trust an annotation without a
   boundary — but a C return value **cannot** be runtime-checked, so FFI is the one boundary where
   the annotation is asserted by a human and not verified. Do not paper over that: `stator explain`
   marks extern calls as an **unchecked boundary** so an audit can enumerate every one of them, and
   `docs/FFI.md` states the asymmetry in the same words. This is also the honest answer to "why is
   FFI not available in `ts` mode's safety story" — it is, with the caveat printed.
9. **`js` mode.** Arguments arriving from untyped code are dynamic, so they get a boundary check at
   the call and `STA2001` on mismatch — the existing runtime trap doing its existing job, not a new
   mechanism. The extern declaration itself is identical in both modes; only the checks differ.
10. **Tests.** Decision tests in both modes (extern call, refused non-primitive, refused varargs).
   The golden test links **libm** — `sqrt`, `fmod` — and a two-function `.c` fixture the harness
   compiles itself, so the golden suite depends on nothing installed; SQLite belongs to Task 7.3
   and the phase Check. At least one ASan test where C writes into a buffer the runtime owns, since
   that is the failure this design is most likely to produce and the ASan job already exists.

**Task 7.2 — Exposing TS to C.** `--emit-header` generates a `.h` for exported functions (Static Hermes `--exported-unit` model); values crossing out are C ABI types where sound, `jsrt_value` otherwise.

Steps (detailed 2026-09-01; plan-notes 131):
1. **`--emit-header` in the CLI**, reusing Task 7.1's ABI table in the other direction: an exported
   function whose WHOLE signature is in the table gets a plain C prototype; anything else takes and
   returns `jsrt_value`. One table, two directions — a second, subtly different mapping is how the
   two halves drift apart. The flag also implies a build-mode change: the output is a linkable
   object/archive rather than an executable, since a unit exposed to C usually has no `main`.
2. **Decide what is exportable, and refuse the rest with a diagnostic.** Exported `function`
   declarations with in-table signatures are the core. Exported `const` of a primitive type can be
   a `#define`-free `extern const`. Classes, closures, generics, and mutable module state are NOT
   exported in v0 — a generic has no single C signature, and a closure has captured state with a
   lifetime C cannot hold. Refusing them loudly is the difference between a small feature and a
   half-working one.
3. **The init contract is the load-bearing part.** A C `main()` must initialize the runtime — GC,
   interned strings, and every module's top-level side effects **in dependency order** — before
   calling anything. Emit `stator_init_<unit>(void)`, declare it first in the header, make it
   idempotent (a second call is a no-op, because a library's init being called by two independent
   consumers is normal), and state in the header's own comment that calling an exported function
   first is undefined behavior. Getting this wrong is silent, not loud — which is why it is a
   generated declaration rather than a line in a doc.
4. **What C sees when TS throws.** Exceptions cannot cross the C ABI, so decide once and generate
   the same thing everywhere: an exported function's generated stub catches everything at the
   boundary. In-table signatures have no room in the return value for an error, so the escape is a
   companion `stator_last_error(void)` (NULL when the last call succeeded) plus a documented
   sentinel return, and the header says the call must be checked. The alternative — abort the
   process on an uncaught exception — is defensible for v0 but must be a written choice, not the
   default that happens if nobody decides. Whatever is chosen, an exception must never unwind into
   the C caller's frame.
5. **Frame and stack roots.** A function entered from C has no parent `JSRT_FRAME`, and Boehm needs
   that thread's stack base to scan conservatively; the generated entry stub establishes both, and
   pops the frame on every exit path including the one step 4 introduces.
6. **Threads: single-threaded in v0, said out loud.** Calling in from a second thread is undefined
   until a task says otherwise, and the generated header carries that sentence. Discovering it
   from a crash is the expensive way to learn it.
7. **Name mangling and ABI identity.** Exported `foo` from unit `m` becomes `stator_m_foo`;
   `--unit-name` sets the prefix (the `--exported-unit` model). A collision is a compile error,
   never a silent last-writer-wins. Emit a version symbol the header asserts against, so a header
   from one build linked against an archive from another fails at link time instead of at runtime.
8. **The header must be deterministic.** Same input, byte-identical output — no timestamps, no
   absolute paths, no hash-ordered iteration. A generated file that changes on every build cannot be
   committed, diffed, or reviewed, and this one is the artifact users will commit.
9. **CI example.** A small `main.c` + the emitted header, compiled and run inside the existing
   `runtime` job (which already has clang and the archive), asserting both a successful call and
   the step-4 error path. An FFI story that is not built in CI decays within a month.

**Task 7.3 — Bindings for existing headers.** Start **manual** (hand-written `declare` files for the demo libs). A libclang-driven generator (functions + scalars + structs-by-pointer only) is built only after ≥3 manual bindings exist to define its spec.

Steps (detailed 2026-09-01; plan-notes 131):
1. **Three manual bindings, chosen for three different shapes** — that is what makes them a spec
   rather than three examples of the same case:
   - **libm** — scalars only, no allocation, no lifetime. Proves the plain path and needs nothing
     installed (it is also Task 7.1's golden test).
   - **SQLite** — opaque handles (`sqlite3*`, `sqlite3_stmt*`), out-params, strings in both
     directions, and error codes. It exercises every hard rule at once, which is why the phase
     Check uses it.
   - **A struct-by-pointer library** — POSIX `stat`, or zlib. Proves the one aggregate shape v0
     supports, including field offsets the binding must not guess.
   Each lands in `examples/ffi/` as a `.d.ts` with its link pragma plus a runnable example.
2. **Record every ambiguity as it is hit**, in `plan-notes.md`, while writing the bindings — those
   notes ARE the generator's requirements document, they are what "define its spec" means in the
   task line, and they are unrecoverable afterwards. Expect them to cluster on: which pointers the
   library retains, which returned strings the caller must free, and which error codes mean
   "failure" versus "no more rows".
3. **Then choose the generator's front end, cheapest rung first.** libclang via napi bindings is a
   new native dependency, and the dependency budget is `typescript` only. `clang -Xclang
   -ast-dump=json` needs **no** new dependency, and clang is already a hard requirement of every
   build. Start there; overturning it needs measured evidence that the JSON AST cannot express
   something the bindings need — recorded in `plan-notes.md` (§15.3), not a preference.
4. **The generator's shape:** parse the header's declarations into a small IR, map each C type
   through Task 7.1's ABI table **in reverse**, and print a `.d.ts`. Everything the table cannot
   map is refused, not approximated. Typedef chains resolve to their underlying type; an anonymous
   struct behind a typedef is still a branded pointer. Output must be deterministic and stable
   across runs (same rule as 7.2 step 8) — a generated binding is a file people commit.
5. **Scope limits are enforced, not documented.** Functions, scalars, and structs-by-pointer only.
   Varargs, function pointers, unions, bitfields, macro constants, and inline functions are
   **rejected with a diagnostic naming the construct and its header line** — a generator that
   silently skips what it cannot express produces a binding that looks complete and is not, which
   is the single worst failure mode available to this task. A summary line reports how many
   declarations were emitted and how many refused, per reason.
6. **The manual bindings become the generator's oracle.** Regenerate SQLite's binding and diff it
   against the hand-written one; every difference is either a generator bug or a manual-binding bug,
   and each one gets resolved rather than tolerated. This is the only cheap test that the generator
   understands real headers, and it costs nothing because both files already exist.
7. **The phase Check's SQLite demo is assembled from GENERATED bindings** once the generator exists;
   the manual binding stays in the tree as step 6's oracle. The demo also exercises Task 7.2 (the
   same example is called from a C `main()`), which is what makes the Check one example instead of
   two.

**Check:** an example that statically links SQLite, queries it from TS, and is itself callable from a C `main()` — built and run in CI.

---

## 11. Phase 8 — The dynamic tier (gated; `js` mode only)

Gate: real users blocked on untyped npm dependencies or `eval`. Do not build speculatively.

- Embed **QuickJS-NG** in the runtime (scriptc `--dynamic` / Perry-eval model): `eval`, `new Function`, `Proxy`, and stubborn untyped modules run interpreted; a marshaling layer converts `jsrt_value` ↔ `JSValue` at the boundary (objects proxied by handle, not deep-copied).
- justfile feature flag so pure-static builds are unchanged. **`ts` mode is untouched: `eval` stays `STA1101`, permanently.**

Steps (detailed 2026-09-01; plan-notes 131). Steps 1 and 2 are not implementation — they are the
two things that must exist before implementation is allowed to start:
1. **Close the gate with evidence, the way Phase 0 was closed.** The gate is "real users blocked on
   untyped npm dependencies or `eval`", and the entry criterion is a written record of WHICH users
   and WHICH dependency or `eval` site — named, not estimated. Owner approval is recorded like
   Phase 0's (plan-notes 123). Until that record exists, this phase does not start; "do not build
   speculatively" is the whole gate, and a phase this large is exactly what a speculative build
   costs.
2. **Design doc before code: the marshaling layer, in `docs/` and reviewed.** It is the entire risk
   of the phase, and it has to answer three things. (a) **Handles both ways, never deep copies** — a
   `jsrt_value` object reaching interpreted code becomes a `JSValue` holding an opaque handle, and
   the reverse; a copy would make mutation invisible across the boundary. (b) **Identity must round-
   trip**: an object that crosses out and back must be `===` to itself, which means a two-way handle
   table, not a per-crossing wrapper. (c) **Two collectors** — Boehm (conservative, ours) and
   QuickJS's refcount-plus-cycle collector — so a live handle must be a root on both sides
   simultaneously. State plainly which cases leak: a cycle spanning the boundary is uncollectable
   in v0, and that ceiling belongs in the doc rather than being discovered later.
3. **Vendor the interpreter at the version already in the tree.**
   `runtime/vendor/quickjs-ng/VENDOR.md` pins `v0.16.2` (`1ab8676…`, vendored 2026-08-30) for
   `libregexp`/`libunicode`. The interpreter ships its own copies of those files, so a second
   version — or a naive add of the full source next to the existing subset — is duplicate symbols
   at link time, not a merge conflict a compiler will catch. Vendor `quickjs.c`/`quickjs.h` at the
   **same commit**, extend the existing `VENDOR.md` rather than starting a second one, and check who
   supplies the `lre_*` embedder callbacks once both halves are present. Acquisition is also
   constrained: this environment has no network (plan-notes 28), so the source has to arrive by the
   same route the existing vendor drop did.
4. **Feature flag on the Task 4.4 model, which already works.** `just runtime-dynamic` builds a
   separate archive into its own build directory, exactly as `just runtime-intl` does, and gets its own CI
   job like `intl` has. The default archive must not gain a byte — which is what the flag is FOR,
   and step 8 is how that claim is checked instead of asserted.
5. **`eval` and `new Function` in `js` mode:** `STA1206` is now emitted as not-yet (Phase 5 step 2);
   the interpreter that retires it lands here. Compile the string at runtime through the interpreter,
   marshal the result back, and give the interpreted scope access to the compiled module's bindings
   through the handle table (the scope bridge, not just the value bridge — a decision the step-2 doc
   has to settle, since a design where `eval` cannot see the enclosing scope is a different feature
   with the same name).
6. **`Proxy` and the descriptor/prototype surface** (`STA1204`): `Object.create`, `defineProperty`,
   `getPrototypeOf`/`setPrototypeOf` were assigned here by §7's exit criterion. They land as
   interpreted-tier objects — the shape model deliberately cannot express them, which is why they
   waited for this phase and not for more shape work.
7. **The computed-specifier half of dynamic `import()`** (Phase 5 step 10c): runtime module
   resolution needs a runtime module system, which is what this tier is. It lands here only if step
   10's owner-confirmed split still says so.
8. **`ts` mode is untouched, and that is a test, not a promise.** A decision test asserts `eval` in
   `ts` mode is still `STA1101` **with the dynamic tier built in**. For the Check's byte-identical
   clause: record the default archive's size and content hash before and after the phase, and have
   CI compare them — a size that is "the same as far as anyone looked" is not the claim being made.
9. **Every code flip is a decision-test change in the same commit** (`// @verdict: not-yet` →
   `dynamic`, with the `// @expected-fail: true` marker removed in that same commit — the standing
   rule in `AGENTS.md`). A `not-yet` code that stops being emitted while its fixture still expects
   it is drift, and the subset runner is what catches it.

**Check:** a `js`-mode program mixing one compiled module + one `eval` call runs correctly; binaries built without the feature (and all `ts`-mode binaries) are byte-identical in size to before.

---

## 12. Make it better — the optimization ladder (post-MVP, in this order)

Ordering rule (from the Boa deep-dive): **memory first, codegen last**. Each step: measure on the Phase-6 harness before/after; keep the change only if the geomean moves.

| # | Change | Expected gain (research-sourced) | Effort |
|---|---|---|---|
| 1 | mimalloc/jemalloc as default allocator | 5–15% on heap-heavy code (Boa evidence) | days |
| 2 | Escape analysis → stack allocation; bump/arena allocation for non-escaping object graphs (one of Perry's actual speed sources, with LICM and integer div/mod fast paths) | large on allocation-bound code | 2–4 wk |
| 3 | Replace Boehm with precise generational GC (nursery + tenured; the §2 shadow-frame discipline makes this runtime-only). Evaluate MMTk before writing one. | Boa budgets 350 h for the same move; 50–70% pause reduction, 10–20% throughput | 6–10 wk |
| 4 | Hot/cold field split in object layout; IC hit-rate counters on dynamic-residue paths to find type-check hotspots | 5–10% (Nova-inspired) | 1–2 wk |
| 5 | String ropes for concat-heavy code + small-string inlining | 5–15% on string workloads (V8/JSC precedent) | 3–5 wk |
| 6 | Direct LLVM backend: emit `.ll` text (no bindings needed from TS) on the hot path; LTO + PGO; keep the C emitter as `--emit=c` debug backend | clang already does most of this — measure before believing | 4–8 wk |
| 7 | Startup: snapshot initialized globals/builtins into the binary (V8 snapshot model) | **none available here** — an empty binary already starts in 3.2 ms (measured; see rung 7 below) | not scheduled |
| 8 | WasmGC backend — cross-browser baseline since Safari 18.2 (Dec 2024). Strategic optionality, not perf | new target, not a speedup | months |

**Entry criterion, and why nothing here is a task yet.** No rung starts before Task 6.3's benchmark
harness exists and its perf-regression gate has a **measured** noise floor (6.3 step 7). Every row
above is a claim about a number; without the harness there is no way for one to be wrong, and a
ladder of unfalsifiable claims is a wish list. When a rung is scheduled it becomes a numbered task in
a phase, with Steps and a Check like any other — this table is an ordering, not a backlog.

**The discipline every rung shares:**
- **Baseline, change, re-measure on the same host**, recording version, flags, hardware and the exact
  program (§15.5). Cross-host comparison is not evidence: `tests/bench/baseline.json` is explicitly
  machine-local.
- **Keep only if the geomean moves past the noise floor; otherwise revert** — and write the negative
  result into `plan-notes.md`. An unrecorded non-gain is re-attempted by the next person at full
  price, which is the most expensive kind of missing note.
- **Semantics are not a variable.** Golden suites stay byte-for-byte, ASan/UBSan and `test:leak` stay
  green, and both GC configurations still build. An optimization that changes output is a semantics
  bug wearing a speedup's clothes.
- **Anything that adds a dependency or a build mode is feature-flagged** on the `just runtime-intl` model
  (Task 4.4): its own build directory, its own CI job, default archive unchanged.

**1 — Allocator.** Check the premise before spending the days: Boa's 5–15% is an *object*-allocator
result, and here the object allocator is Boehm. Every collected allocation goes through
`GC_generic_malloc` in `jsrt_gc_alloc` (`runtime/src/jsrt_gc.c`), which mimalloc under `malloc` never
sees. What a swapped allocator does reach is the non-collected sites — regexp capture and key
scratch, shape key encoding, unicode conversion buffers, JSON digit buffers, the `console.count` /
`console.time` tables, Intl — plus the no-Boehm fallback, where `jsrt_gc_alloc` *is* `malloc`.
So profile those sites first; if they are a couple of percent, record it and skip the rung.
Otherwise this lands **after** rung 3, when the collector is ours and its backing allocator is a real
choice. Acquisition is a vendor drop with a `VENDOR.md` pin under the no-network constraint
(plan-notes 28), never a package fetch — and never a global `malloc` interposition while Boehm is in
the process: two allocators contending for one symbol is a debugging session, not a benchmark.

**2 — Escape analysis.** The preconditions already hold: allocation sites are visible in HIR (object
and array literals, closures), and the pass belongs in `src/passes/` beside `constfold`/`dce`/
`inline`, with `verifyHir` running after it like every other pass. Conservative by default — an
allocation escapes unless proven otherwise — and three things escape: stores into a global slot,
anything a callee can reach, and anything live on a landing-pad path out of the frame. The trap is
specific to this design: `jsrt_push_roots` masks every frame slot and hands it to Boehm as a heap
address, so a stack-allocated or arena object must **never** occupy a `JSRT_FRAME` slot. Make that an
HIR-verifier check (a stack allocation's uses are all frame-local), not a code-review habit. LICM and
the integer div/mod fast paths named in the row are separate changes — land them separately or the
geomean cannot attribute the win to any of the three.

**3 — Precise GC.** Half of it is already paid for: root enumeration is real and load-bearing
(`jsrt_push_roots` walks the shadow stack), which is what §2's rooting discipline was always for.
What is missing is *heap* precision — `jsrt_mark` masks every word and marks conservatively, with a
documented ceiling of retaining objects it does not own. Precise means a layout descriptor per
collected allocation, which touches every `jsrt_gc_alloc` call site. Two things settle before code:
(a) **MMTk's API is Rust**, and "no Rust anywhere" is settled (§15.4) — evaluating MMTk is fine,
adopting it reopens a settled decision and needs measured evidence in `plan-notes.md`, not a
preference; (b) a **moving** collector invalidates any NaN-boxed reference a C local holds across a
safepoint, so "a reference that crosses an allocation lives in a frame slot" must become an enforced
codegen invariant *before* anything moves. The second win is easy to miss: the no-Boehm build never
collects at all today (justfile: "plain malloc (no collection)"), so this rung is also what
makes `pnpm run test:leak` meaningful on a machine without bdw-gc instead of skipping.

**4 — Hot/cold split and IC counters.** Cheap because both mechanisms exist already
(`runtime/src/jsrt_shape.c`, the emitter's `icSite()`); this is instrumentation, not machinery.
Counters first — hit / miss / megamorphic per site, dumped at exit — and the field split follows what
they say. Splitting layout before the counters exist optimizes the profile you imagined. Counters
live behind the feature-flag rule above, so the default archive keeps its size.

**5 — String ropes.** Codegen is already insulated: `jsrt_value.h` states that generated C touches
string contents only through `jsrt_string_length`/`jsrt_string_char` so exactly this change stays
runtime-only. The cost is inside the runtime, where ~93 direct `->data` uses across six files
(`jsrt_string.c`, `jsrt_string_ops.c`, `jsrt_regexp.c`, `jsrt_print.c`, `jsrt_unicode.c`,
`jsrt_intl.c`) assume a flat buffer — each becomes a flatten call or a rope-aware rewrite, and the
regexp bridge is the one place flattening is not optional (libregexp wants contiguous units).
Small-string inlining is a *different* change with a heavier blast radius: it redefines what a
NaN-boxed payload can hold, so it edits `docs/VALUE.md` and `jsrt_value.h` — the codegen↔runtime
contract — in the same commit. Identity is the correctness trap: `===` on strings is by value, and no
rope may make two equal strings distinguishable. Justification comes from Task 6.3's string-churn
program, not from V8/JSC precedent.

**6 — LLVM backend.** Cheapest rung first, and here that is not LLVM: measure what `-O2` C leaves
behind by building the compute set with `-O3`, `-flto` and PGO through the existing path
(`src/cli/build.ts` passes a single `-O2` today). If LTO+PGO recovers most of the gap, this row is
days of flag work rather than 4–8 weeks and the backend is unnecessary. If it is built, `--emit=c`
stays permanently — it is how a codegen bug gets reported (`--keep-c`) — and the real cost is not
instruction selection but everything clang was doing for free, starting with `#line` maps becoming
`!dbg` metadata.

**7 — Startup snapshot: measured, and not scheduled.** V8 snapshots exist because V8 *constructs* a
builtin object graph at startup. Stator does not: `jsrt_init()` is a 48-bit-pointer probe plus
`GC_INIT()`, builtins are dead-stripped C functions rather than constructed objects, and `main()`
opens a globals frame and runs the program. Measured 2026-09-01 (Apple M3 Max, Darwin 25.6, Apple
clang 21.0.0, `-O2`, Boehm build, Node v26.7.0, best of 15 spawns): empty compiled program
**3.2 ms**, `node` on an empty module **27.0 ms**, `/bin/true` **0.23 ms**. The whole budget a
snapshot could attack is ~3 ms, most of it dynamic linking — the row's "50–200 ms class wins" was
inherited from an architecture Stator does not have (plan-notes 137). The rung goes live only if a
profile shows a startup floor worth attacking, and the lever then is link-time (static linking,
page-in behaviour), not a heap snapshot.

**8 — WasmGC.** The row is honest that it is optionality, not speed; gate it like Phase 8, on a named
user needing a browser target, recorded before work starts. Be equally honest about the size: under
WasmGC the *host* owns objects, so NaN-boxing, Boehm, and the shadow-stack rooting discipline all
stop applying. That is a second backend and a second runtime sharing a frontend — which is why it is
months, and why it is last.

Standing practices:
- **Split emitted C per module and compile in parallel** — today `emitC(module)` returns one string
  and `linkExecutable` makes one `clang -O2` call over it (`src/codegen/index.ts`,
  `src/cli/build.ts`), so a large program is one translation unit on one core. This is also the v0
  incremental-build answer: whole-program HIR, per-module C, `.o` cached by content hash of (C text +
  flags + runtime archive). Measure the trade rather than assuming it — separate TUs lose
  cross-module inlining at `-O2`, which is precisely the hole `-flto` (rung 6) fills.
- **Compiler throughput:** reuse the `ts.Program`/checker across builds (watch mode later); if parsing/checking exceeds the §13 tripwire, move parsing to `oxc-parser` (napi) and keep the checker for types only; re-evaluate tsgo quarterly. Measured first on 2026-09-01: the `typescript` API is 8.5% of a 111,750-line build and shrinking with scale, so this is not where the time goes (plan-notes 134).
- **The HIR verifier's scope copying is the front end's actual ceiling** — `verifyFunction` and `verifyBlock` copy the whole enclosing binding map (`new Map(bindings)`, `src/hir/verify.ts`), which is quadratic in program size: measured 190 ms at 11k lines, 3.6 s at 45k, **21.5 s at 112k** — 82% of the front end and 41% of the whole build, against 4.5 s for everything `typescript` does. A parent-linked scope (lookup walks the chain, `set` writes to the innermost) removes the copy without changing what the verifier accepts — and makes `src/cli/build.ts`'s "it costs one tree walk" true again. Owns its own Check: the pass must still reject every HIR it rejects today (plan-notes 134).
- **Perf-regression gate in CI** (Boa's lesson: conformance work silently taxes performance ~1–2%/release without a gate). It is specified in Task 6.3 step 7, threshold included: the gate sits above a *measured* spread, because an alarm that fires on noise costs more than no gate.
- **Publish the conformance % and benchmarks** — the field's trust currency. Task 6.1 steps 6–8 own the number and the honesty rules that travel with it (skips counted by feature, printed beside the percentage).

---

## 13. Risks (with tripwires)

| Risk | Tripwire | Response |
|---|---|---|
| `typescript` API too slow / memory-heavy on large graphs | checking >30% of compile wall-time, or OOM on a 100k-line graph | Program reuse + caching first; then `oxc-parser` (napi) for parse, checker for types only; re-test tsgo's API each quarter in `plan-notes.md`. **Measured 2026-09-01 — not tripped:** 8.5% of wall and 856 MB peak on a 111,750-line graph, and the share falls as the graph grows (plan-notes 134). Next re-test 2026-12 |
| Subset too small to be useful | Phase-3 exit program needs >3 workarounds | Widen `SUBSET.md` deliberately (one row at a time, with decision tests), never ad hoc in code |
| `js` mode drifts toward full-JS static analysis (the graveyard's mistake) | any `js`-mode feature that needs whole-program abstract interpretation of untyped values | Route it to the dynamic representation or Phase 8 tier — §0.1 is absolute |
| Builtins long tail eats the schedule | Coverage dashboard flat for a month | Cut scope to the niche's actual needs; consider pulling Phase 8 forward for cold builtins |
| Boundary checks dominate runtime | Profiler shows >15% in `jsrt_check_*` | Check-coalescing pass (hoist out of loops); widen compiled types |
| Monomorphization code bloat | Binary >2× budget | Instantiation sharing; boxed `Unknown` fallback instantiation for cold generics (Task 3.4) |
| Own-source strictness fights Node type-stripping | build breaks on `enum`/`namespace`/param properties | They're banned (`erasableSyntaxOnly`) — fix the code, never the config |
| The niche evaporates (a competitor ships it) | Quarterly `NICHE.md` review | Fold effort into contributing to that competitor — the sunk-cost check is explicit |

---

## 14. Effort summary (effort, not deadlines — see §2)

| Milestone | Scope | Estimate |
|---|---|---|
| Bootstrap + skeleton (Phases 1–2) | hello world, differential harness, CI | 2–4 wk, 1 agent/engineer |
| MVP `ts` mode (Phases 3–4 + fuzzing) | scriptc-scope: CLI tools/workers, ~500-line programs | 4–6 months, 1–2 in parallel (disjoint lowering rungs) |
| `js` mode (Phase 5) | mixed graphs, `var`, dynamic residue everywhere | +4–6 wk |
| Conformance visible (Phase 6) | Test262 dashboard, nightly fuzz, bench page | +3–4 wk, then continuous |
| FFI (Phase 7) | SQLite demo, header gen | +4–6 wk |
| Dynamic tier (Phase 8) | QuickJS-NG fallback | +6–10 wk *if gated in* |
| Optimization ladder §12 rows 1–5 | competitive perf story | +3–5 months |
| Conformance long tail | Porffor is at ~61% Test262 after years with a funded lead | years — the moat, budget honestly |

---

## 15. Agent execution protocol

1. Work top-down by phase; within a phase, by task order (steps are ordered by dependency). Do not start a phase before the previous phase's **Check** passes. Phase 0's tag gate requires a human; stop and ask there.
2. Every claim of "done" cites the Check command output (test run, CI link, benchmark diff). No Check, no done. A Check must also stay re-runnable at any later HEAD: an assertion **about** HEAD (`git describe --exact-match HEAD`, "the working tree is clean", a line number) is a point-in-time observation, not a Check, and it turns finished work into work that reports itself unfinished (plan-notes 135).
3. New facts that contradict this plan (a dependency changed, a measurement disagrees) → append to `plan-notes.md` with evidence; update this plan in the same change. The plan is living, but it changes by edit, not by drift.
4. Decisions already made here are **settled** — re-open only with new measured evidence in `plan-notes.md`: TypeScript-strict implementation using the `typescript` API in-process; C11 runtime; emit C; no Rust anywhere; NaN-boxing + `JSRT_FRAME` rooting; UTF-16 strings; Ryū-exact number printing; `Unknown` as first-class HType; cycle-rejecting ESM-only modules; the feature × mode matrix (`docs/SUBSET.md`); `ts` as default mode; `eval` permanently rejected in `ts` mode; the locked tsconfig.
5. When measuring against Node/Bun/QuickJS/competitors: record version, flags, hardware, and the exact program. Never compare against a number you didn't produce.
6. Ambiguity rule: if a task still leaves you guessing, the gap is a bug in this plan — record it in `plan-notes.md` and resolve it by editing the plan, not by inventing an undocumented convention in code.
7. `tsconfig.json` and the Biome rules are load-bearing. Never weaken them to make code compile — fix the code, or follow rule 3.
8. Generated C is never hand-edited; fix the emitter. Vendored code (`runtime/vendor/`) is never modified except by documented, minimal patches recorded in `plan-notes.md`.
9. **A `not-yet` diagnostic names the phase that owns its BLOCKER**, never the phase that happens to be open — and when a phase closes, every code naming it is delivered or reassigned in that same change. A not-yet pointing at a finished phase reads as a schedule and is a dead end (plan-notes 112). Two corollaries, both learned the hard way (plan-notes 136): a blocker that is a **build flag** is not a phase at all, so the diagnostic omits `phase` and names the flag; and a **catch-all** takes the phase that owns most of what it refuses, with the named exceptions answered from a table beside it. This rule lived only inside §7 Task 4.7 until 2026-09-01, which is part of why seventy sites survived naming a phase that had been complete for six days. `tests/unit/phases.test.ts` enforces it against `src/support/phases.ts`, which `done.md` pins.

---

## 16. Verification log

- **v1.0** (2026-08-29): initial plan synthesized from the five research fan-outs.
- **v1.1** (2026-08-29): adversarial review by three independent agents; 24 findings folded in. Highlights: WasmGC ship dates corrected; tsgo/OXC API maturity caveats added; Static Hermes ffigen downgraded to "experimental in-tree script"; unverified Boa/scriptc figures marked reported-not-measured; numeric-semantics contract, GC rooting-before-codegen, exception-cleanup, and module-init-order tasks added as blockers; classes-with-getters and Map-key ambiguities resolved; CLI renamed `ketch` (jsc collides with JavaScriptCore); bootstrap task, sidecar protocol, test-metadata conventions, machine-verifiable Checks specified. One reviewer suggestion **rejected**: rounding float output to 6 decimals in differential tests — that hides real divergences; we match Node's shortest-round-trip formatting exactly instead.
- **v2.0** (2026-08-29, directed pivot by project owner):
  - **Renamed Ketch → Stator** (name collision; stator/rotor mirrors the static/dynamic mode pair). CLI binary `stator`.
  - **Implementation language: Rust → TypeScript (strict).** Consequences: Cargo workspace → npm workspace; the entire tsc *sidecar* (out-of-process JSON protocol, `tools/sidecar/`, `SIDECAR.md`) is **deleted** — the checker is now in-process via the `typescript` API, removing the plan's highest-risk glue; OXC drops out of v0 (kept as a §13 fallback via napi); the runtime moves from Rust-staticlib-with-C-ABI to plain **C11** (same NaN-boxing, rooting, Boehm, libregexp design — unchanged conceptually).
  - **Two-mode product spec added (§1):** strict `ts` mode (TS-only; `any` and dynamic escape hatches are errors — `eval` permanently) and `js` mode (JS and JS+TS mixed; untyped = dynamic, never rejected). `SUBSET.md` upgraded from a 3-way column to a feature × mode matrix; diagnostics got stable `STA` codes with disjoint never/not-yet ranges; `stator explain --json` added so decision tests are machine-verifiable.
  - **`js` mode inserted as Phase 5**; old Phases 5/6/7 renumbered to 6/7/8; Test262 explicitly bound to `js` mode.
  - Every phase expanded to numbered per-task **Steps** executable by any AI agent; `AGENTS.md` (operational handbook) introduced at repo root; spec docs consolidated under `docs/`.
- **v2.1** (2026-08-29): **Phase 1 marked ✅ COMPLETE** after re-verifying its Checks with a clean `./ci.sh` run (subset runner: `152 fixtures — 0 passed, 152 expected-fail, 0 failed` — the correct pre-Phase-2 state). The executed step lists and the 26-row seed matrix were removed from §4: `docs/SUBSET.md` (76 rows) and `docs/DIAGNOSTICS.md` are the row/code authorities, and the deviations live in `plan-notes.md` entries 1–19 (incl. the ESLint→Biome swap, #19). **Phase 0 remains open** — no `NICHE.md` or `phase-0-approved` tag; it was bypassed for Phase 1 on explicit owner instruction and still gates Phase 2 per §15.1. The Phase 1/3 implementation snapshots are now committed. Also open: the Node 26.7.0-vs-LTS pin question (notes #9).
- **v2.2** (2026-09-01): **the log resumes** — it had stopped at v2.1 while Phases 2, 3 and 4 were built, so the plan's own change history was silent for the largest stretch of work in the project. Recorded now, from `plan-notes.md` and the phase Check lines: **Phase 2 ✅ COMPLETE** (2026-08-29, walking skeleton end to end); **Phase 3 ✅ COMPLETE** (2026-08-30, all twelve tasks and eight ladder rungs; the phase exit ran a 477-line five-module transit route planner byte-for-byte against Node); **Phase 4 in progress** — 4.1, 4.3, 4.4, 4.5 landed and 4.6 landed its async half, with 4.2 (builtins) open at 131/197 dashboard members.
- **v2.3** (2026-09-01): **`plan.md` split** — completion records moved to `done.md`, leaving this file at open work only (761 → ~420 lines). Section numbers and every task's number and title are unchanged so the ~60 `plan.md §N Task X.Y` references in `docs/`, `src/`, `runtime/src/` and `tests/` still resolve (plan-notes 115). **Phase 4 gained an explicit exit criterion**, which it had never had — it had a Check but no scope boundary, which is why four not-yet codes named it as their deliverer while it was closing. The residue is now assigned by blocker: `Date` to Task 4.2 (which had never actually named it), `RegExp`'s `exec`/`match` to Phase 4's own array-with-properties work, `matchAll` and the iterator surface to Phase 5 step 8, top-level `await` to step 9, dynamic `import()` to step 10, the descriptor/prototype surface to Phase 8. Phase 5 is retitled to admit that steps 8–11 are not `js`-mode work. New **Task 4.7** audits the 58 gate call sites that hardcode phase 4, and §15 gains the rule that a not-yet code names the phase owning its **blocker**, never the phase that happens to be open (plan-notes 116).
- **v2.4** (2026-09-01): Re-reviewed the Phase-4 implementation and roadmap. The completed Task 4.3–4.6 records were already preserved in `done.md`; their duplicate narratives were replaced here by required one-line stubs. Task 4.1 remains open for the array-with-properties blocker, and Task 4.2 remains open at the live dashboard's 131/197 surface members (plan-notes 118).
- **v2.5** (2026-09-01): **the two open tasks gained numbered Steps** (plan-notes 127), backed by a five-agent evidence audit of the repo and the pinned Node v26.7.0. Task 4.2's remainder is now two step lists — `Date` (sliced by what makes each member deterministic: a TZ-independent core, a local-time slice behind a golden-runner `TZ=UTC` pin, an intl-build residue for the ICU-named `toString`/`toLocale*` family, and the carve-out pair; ISO-only `Date.parse` recorded as a documented divergence) and `console.table` + the `time`/`timeEnd`/`trace` carve-out trio. Task 4.7 gained Steps and its own Check; its site count was corrected from 58 to the audited **63** (60 `STA1214` + 2 `STA1211` + 1 `STA1215` at `39cf053`), with the audit's grouping (2 pure-5.8, 2 pure-5.11, 8 straddling catch-alls, 51 unowned) folded into the steps. The exit-criterion `Date` bullet was rewritten per-member per the plan-notes-125 rule.
- **v2.6** (2026-09-01): **reconciliation after a same-day race** (plan-notes 130). The `console.table` + carve-out-trio step list added in v2.5 was overtaken by a parallel session that landed the work (`0ef7724`; carve-out proof `tests/unit/console-carveout.test.ts`) while the steps were being adversarially verified — the list is replaced by a landed record, leaving `Date` as Task 4.2's only remaining builtin. The race also produced the second plan-notes numbering collision (see note 115): two same-day entries each took 126 and 127; the later pair is renumbered 128/129 and the one inbound reference fixed. The verification pass on v2.5's own text resolved three challenges: the 63-site count STANDS (the challengers' single-line greps miss multi-line `notYet(` calls — a multiline-aware recount of the current tree finds 61 + 2 + 1 = 64, moved by the console slices exactly as Task 4.7 step 1 predicts), the Promise call-side phase-5 claim stands, and one bad reference (plan-notes 117, which does not exist — the console plumbing note is 94) went away with the replaced step list.
- **v2.7** (2026-09-01): **every remaining phase gained numbered Steps** (plan-notes 131) — Phase 5's eleven steps, Phase 6's three tasks, Phase 7's three tasks plus a phase preamble and an explicit v0 out-of-scope table, and Phase 8's nine. Written against the live tree rather than from the task lines, which changed several of them: Phase 5 step 1's substrate (`allowJs`/`checkJs` by mode, HIR `provenance`, `explain`'s per-function print) is already landed, so the step is now the `inferred` grade alone; step 5's boundary-trap proof cannot be a Node-diff golden, because Node runs a lying-JSDoc program happily — it needs an expected-stderr harness mode; step 11's mechanism is not a new one but a subsection of `docs/VALUE.md` §4.9's existing pending-cell protocol — a runtime-side call that checks `jsrt_pending()` and hands the builtin a completion value, which is precisely the gap `STA1216`'s row already names — and it carries an unlock sweep (`Object.freeze`/`isFrozen`, `toISOString` on an Invalid Date, every `SUBSET.md` row that reads "the spec throws, which builtins cannot raise yet"). Phase 6 is framed by its one failure mode — a green signal that proves less than it appears to — so Test262 skips are mapped from `SUBSET.md` rows with an unmapped feature tag a hard error, the corpus is fetched rather than vendored (~50k files, and no network here — plan-notes 28) with a missing corpus SKIPPING so `pnpm run ci` stays offline-runnable, the fuzzer is type-directed and seeded (no clock, no `Math.random`) so a finding replays from `--seed=N`, and Task 6.3 extends the existing `tests/bench/record.ts` instead of replacing it. Phase 7 gained the four things that make FFI four weeks instead of one line (memory, UTF-16 strings, C error codes, direction asymmetry), a concrete ABI table, and the two questions nobody can leave implicit: which side owns a pointer after a call, and what a C caller sees when TS throws. Phase 8's first two steps are not implementation — the human gate's evidence, then the marshaling design doc — and its vendoring step must match the `v0.16.2` commit `runtime/vendor/quickjs-ng/VENDOR.md` already pins, since the interpreter ships its own `libregexp` and a second copy is duplicate symbols at link time.
- **v2.8** (2026-09-01): **Phase 0's Check restated so it can pass more than once** (plan-notes 135). The gate itself is unchanged — `NICHE.md` was approved by the owner on 2026-09-01 and its commit is tagged `phase-0-approved`, which supersedes v2.1's "Phase 0 remains open" above — but the Check was written as `git describe --tags --exact-match HEAD`, which asks whether HEAD *is* the approval commit and therefore answered `fatal: no tag exactly matches` from the next commit onward: a closed gate reporting itself open at every later HEAD, in the one section §15.1 makes every phase point at. It now asserts the durable fact (`git cat-file -e phase-0-approved:NICHE.md`, with the added-in-that-commit form as the stronger check), and §15 rule 2 gained the general form — a Check must stay re-runnable at any later HEAD, because an assertion *about* HEAD is a point-in-time observation, not a Check.
- **v2.9** (2026-09-01): **the not-yet audit's own inventory was audited, and it was 2.6× short** (plan-notes 136). Task 4.7's step 1 says to re-derive the site list at execution HEAD; parsing `gate.ts` with the `typescript` API instead of grepping it finds **165** `notYet`/`dateNotYet` sites, not 63 — and 70 of them name **Phase 3, complete since 2026-08-30**, so `rest parameters are not yet supported; planned for Phase 3` is what the compiler prints today. The audit missed them because it asked "which sites name phase 4?" — a question about the phase that happened to be open — while the rule the task itself establishes implies the general one, "does any site name a completed phase?". Task 4.7's inventory paragraph is replaced by the parsed table, step 1 now carries the general question, and step 6 gains two groups (the 70-site ladder residue; the 10 `dateNotYet` sites, whose blocker is the intl feature BUILD and so is step 3's `STA1215` question again, not a phase). §8 Phase 5 gains **step 12**, which owns the residue — six construct families in landing order with their own Check — because it is `ts`-mode static surface §1.1 promises will compile and no phase owned it; deliberately not a new phase, since §15.3 forbids the renumbering that would break `plan.md §N` citations. Phase 5's title gained "3 and", and its bucket warning — previously a feeling — became a named split trigger.
- **v3.0** (2026-09-01): **Phase 4 closed.** Task 4.7 was its last open task, and closing it is what made the phase closable honestly -- 165 not-yet sites re-derived, every one now naming the phase that owns its blocker, and `tests/unit/phases.test.ts` failing the build if that stops being true. §7 compresses to a completed-phase stub on §6's model (task numbers and titles stay, so `§7 Task 4.N` citations resolve); `done.md` gains the exit criterion answered bullet by bullet with the dashboard beside it, and its Phase 4 heading now reads ✅ COMPLETE, which `src/support/phases.ts` mirrors in the same change because the test pins the two together. Three of the five exit bullets sit below 100% on the dashboard and the phase still exits: the dashboard counts MEMBERS, not blockers, and every residue names an owner (plan-notes 125). Phase 5 is now the open phase.
- **v3.1** (2026-09-01): **Phase 5 step 1 was already landed, and its own wording was the thing that needed fixing** (plan-notes 140). The `inferred` grade shipped in `5e9f2b4` the day before v2.7 wrote it up as remaining; what was actually missing was the `explain --json` test, now in `tests/unit/cli.test.ts` and proved able to fail. The step's spec half was worse than stale: it graded a fully JSDoc'd `.js` function `inferred` while the tree grades it `typed`, and step 5 was about to key boundary insertion on a field whose two readings put the trust axis in OPPOSITE directions. A measurement settled it — `checkJs` plus `program.ts`'s fatal `STA0012` means a lying JSDoc is a compile error, not a runtime trap, so what needs checking is a dynamic argument reaching an annotated signature, which is a property of the EDGE and not of any per-function grade. Steps 1, 5 and 6 edited accordingly; `docs/MODES.md` §4 Example 1 (which asserted a runtime check for a call `tsc` rejects statically) and `docs/HIR.md`'s undocumented `provenance` field fixed in the same change.
- **v3.2** (2026-09-02): **Phase 5 step 2 landed** — the diagnostic table now switches by mode (plan-notes 141). Three things that looked implemented were dead: `STA1002` never fired because `allowJs` was ts-off and tsc dropped the `.js` file as `STA0012`; the eval check required `getSymbolAtLocation === undefined` and eval has a lib symbol, so the global catch-all swallowed it as `STA1214`; `1 as any` fired `STA1003` on the binding first. `STA1206` is now emitted. Indirect eval `(0, eval)("x")` is still the arbitrary-callee not-yet.
- **v3.3** (2026-09-02): **Phase 5 step 3 landed** — `var` in js mode is function-scoped, hoisted, initialized `undefined` (plan-notes 142). ts mode stays `STA1104` never. HIR has no `var` kind: the lowering hoists a `let` and assigns at the original site.
- **v3.4** (2026-09-02): **Phase 5 step 4 landed** — Unknown/empty-`{}` property get/set/index/call, `STA2006`, STA2004 grow-only, STA4058 retired (plan-notes 143).
- **v3.5** (2026-09-02): **Phase 5 step 5 landed** — mixed-graph boundary checks at declaration/assignment/call/return edges (plan-notes 144). Trap is an untyped `.js` identity into a `.ts` `number` slot (`STA2001`); a function whose body checkJs types as `string` is `STA0012` and never reaches runtime. Happy path `tests/golden/js/mixed_graph/`.
- **v3.6** (2026-09-02): **Phase 5 step 6 landed** — a fully JSDoc'd `.js` module has file verdict `static` with provenance `typed`; `tests/golden/js/jsdoc_static.js` matches Node.
- **v3.7** (2026-09-02): **Phase 5 step 7 landed** — js-column honesty sweep of already-landed operators/statements plus `tests/golden/js/capstone.js`; `hTypeAssignable` recurses into arrays so `var xs = []` verifies (plan-notes 146).
