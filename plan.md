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
5. **Never emit Rust, and don't use Rust anywhere in this project.** Rust-as-target was measured and rejected (dyn-dispatch overhead, DSTs, `Rc<RefCell>` aliasing, slow borrow-check on generated megafiles). The compiler is TypeScript; the runtime is **C11 with a Zig memory core** (plan-notes 238 / T9.1). Generated code stays C. The C11-only runtime was reopened on the creator's direction, not measured evidence — C11-only returns only on the same kind of direction. No FFI between compiler components. Do not grow Zig past the memory core without a new plan card.
6. **The runtime is the moat, not the codegen.** GC, builtins coverage, strings, RegExp, and ICU are where the years go. Budget accordingly; tree-shake builtins from day 1.
7. **Allocation dominates, not dispatch.** Boa's Cranelift JIT experiment proved it: 10× on numeric loops, <5% on allocation-bound benchmarks; GC tracing 10–16% of time, dispatch only ~13%. This ordering drives the optimization ladder (§12).
8. **One pipeline, two modes.** A mode is a *policy layer* (which files are accepted, which constructs are errors, how untyped code is typed) over one shared pipeline. If a feature seems to require forking the pipeline per mode, the design is wrong — stop and fix the design (usually: the feature belongs to the dynamic representation or the Phase-8 tier).
9. **The compiler itself is strict TypeScript.** Locked `tsconfig` (§4 Task 1.0), no `any` in compiler source, `node:test` for unit tests, runtime dependency budget: the `typescript` package only — **owner-directed exception (2026-09-04, plan-notes 187):** `src/cli/` may use ink + react (human-facing rendering plus per-command help, long-form flags) and dotenv (environment loading), and OpenTelemetry tracing (`@opentelemetry/*`, opt-in via `STATOR_OTEL`, standard OTLP env config — works with Maple and any OTLP backend) is wired through `src/support/telemetry.ts`; execa is dev-only for `tests/unit/cli.test.ts`. The budget still rules everything else: no pass, lowering, or codegen code may depend on these. The compiler must always pass its own `ts` mode's *philosophy*: fully typed, no dynamic escape hatches.

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
        runtime/ (C11 + Zig memory core): NaN-boxed jsrt_value, Boehm GC (v0) → precise generational (§12),
        builtins, QuickJS-NG libregexp, Ryū dtoa, optional QuickJS-NG interpreter tier
        for eval/untyped modules (Phase 8, js mode only)
```

`docs/ARCHITECTURE.md` renders this section as D2 diagrams (component, sequence, package,
value-flow views) sourced from `docs/architecture/*.d2`. It is a visualization of this section, never an authority over it.

**Repo layout (fixed):**

```
plan.md AGENTS.md plan-notes.md NICHE.md          # root (pnpm workspace + .moon/; plan-notes 204)
docs/    ARCHITECTURE.md architecture/*.d2 MODES.md SUBSET.md DIAGNOSTICS.md VALUE.md NUMERIC.md HIR.md TOOLCHAIN.md
packages/compiler/  src/{cli,frontend,hir,lower,passes,codegen,support}  (package "statorc" + locked tsconfig)
packages/runtime/   include/jsrt_value.h  src/ (C11 + Zig memory core, T9.1)  vendor/  (justfile)   → packages/runtime/build/libjsrt.a
packages/tests/     unit/  subset/  golden/ts/  golden/js/  differential/  bench/  (package "@stator/tests")
```

The three packages sit under a private pnpm workspace and are orchestrated by moon (`.moon/`); `pnpm run ci` stays the serial gate and `moon run tests:ci` mirrors it as a cached graph (plan-notes 204). The pipeline below is unchanged by the move.

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

**Settled 2026-09-04 (plan-notes 190, closing notes #9):** the Node pin is **26.7.0** and stays
there. Task 1.0 step 2's wording was "current Node LTS" and 26.x is Current, but the pin has been
the differential ground truth since 2026-08-29 and three artefacts are now measured against it —
146 golden fixtures byte-for-byte, the Test262 ratchet, and `tests/bench/baseline.json`. Moving to
24.x re-baselines all three to satisfy a word, and Node 26 enters LTS this October regardless.
`.node-version` and `mise.toml` already agree; nothing changes but the question. (The "nothing is
committed yet" follow-up is closed: the tree
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
   The lint/format config (`.oxlintrc.json` + `.oxfmtrc.json` — format checking folded into `lint`, warnings escalated; oxlint replaces the Biome of plan-notes 19, plan-notes 224), the `src/` skeleton (whose `build`/`explain` report honest not-implemented diagnostics), the justfile, the npm scripts, `.github/workflows/ci.yml`, and `./ci.sh` (the CI until a remote exists) are all in place — the files themselves are now the reference; AGENTS.md carries the command list.

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

Steps (1–11 detailed 2026-09-01 against the live substrate; plan-notes 131. Step 12 was added the
same day from Task 4.7's inventory; plan-notes 136). **Steps 1–11 have landed**; their evidence is
in [done.md](done.md) → Phase 5. Numbers and titles stay here so `§8 step N` references resolve.
What is still OPEN in this phase is **step 12(d)'s class-member remainder and 12(e)'s opaque-class remainder** (Agent 1: `agent/p5-class-surface`, plan-notes 272), and **step 12(c)'s spread residue and 12(f)** (other agents) — step 2a(c) is closed (2488 landed in plan-notes 280, 2454 in wave 3; the bullets below say where), all three step-2a(b) buckets have landed (2683/2769/2464, plan-notes 272), and steps 18–46 have all landed (struck stubs below; evidence in [done.md](done.md) → Phase 5). The two
shipped-construct defects the bug hunt of 2026-09-11 found (steps 15 and 16) both landed the same
day — plan-notes 225 and 226.
Step 13 was added and landed on 2026-09-04 (plan-notes 193); step 14 was added on 2026-09-09
(plan-notes 209) and landed on 2026-09-11 (plan-notes 216). Tags below carry both legends (§14):
difficulty as `[Dn]`, priority as `[Pn]`, and where a task's steps disagree the task keeps the
highest of them — which is also how the heading reads (`D2 · P1` is the lowest difficulty and the
highest priority among the items below, not the phase's own shape). Step 2a(c) is `[D4][P0]` — it is
the shared blocker the (b) sweep ended at, so every further suppression decision waits on the
question it asks rather than on another bucket judgment. Step 2a(b)'s three remaining buckets are
`[D2][P1]` and **blocked** on step 12's surface, which is why they are not P0 as well. Step 15 is
`[D4][P1]` — a defect in a construct Stator already ships and already claims to compile, the
`await`-in-a-loop one being a SIGTRAP at `-O2`. Step 16 was the second such defect when this tagging
pass began and landed during it, which is why it now carries no tag (§14: struck-through work does
not).

~~**Step-12 bookkeeping debt** (added 2026-09-04; closed 2026-09-08, all three sub-items in one
bundle — evidence: done.md → Phase 5).~~ ✅

1. ~~Frontend: `allowJs` + `checkJs`-style inference in the `ts.Program`; per-function
   "typed | inferred | dynamic" provenance recorded into HIR.~~ ✅ **landed** (2026-09-01,
   plan-notes 140) — the grade answers what the AUTHOR wrote, not which file it lives in.
2. ~~Gate: switch the diagnostic table by mode — `any`/`as any` lowers to `Unknown` in `js`, `var`
   becomes legal there, a `.js` entry under `ts` stays `STA1002`, and `eval`/`new Function` emit
   `STA1206` not-yet Phase 8 while `ts` keeps `STA1101`/`STA1103` never.~~ ✅ **landed**
   (2026-09-02, plan-notes 141).
2a. **Step 2's other half: the `compilerOptions`, not just the diagnostic table** (added 2026-09-03
   from Task 6.1's first corpus pass; plan-notes 175–176). Step 2 switched *which diagnostics the
   gate emits* by mode and never audited *what Stator asks the checker to enforce* against the same
   contract. §1.2 is one sentence — untyped code is never rejected — and several Stator-owned
   checker settings break it by refusing code that is not untyped at all, just not TypeScript.
   `noFallthroughCasesInSwitch` and `useUnknownInCatchVariables` are already fixed (they are now
   `mode === 'ts'`); Test262 found them because no decision fixture had asked, both being things
   nobody writes deliberately in TypeScript. What is left, in measured order:
   ~~(a) **The possibly-null family** (2531/2532/2533, 2721/2722/2723, 18047/18048/18049).~~
   ✅ **landed 2026-09-03** (plan-notes 180).
   (b) The rest of the `STA0012` buckets, each judged individually against §1.2 rather than as a
   group — some are real refusals Stator should keep. The bucket sizes are the measurement taken
   after (a); four have since landed and are struck through:
   ~~3233 `Argument of type 'X' is not assignable to parameter of type 'X'`~~ ✅ 2026-09-03
   (plan-notes 185) · **1326 `Cannot find name 'X'`** · ~~468 `Type 'X' is not assignable to type
   'X'`~~ ✅ 2026-09-03 (plan-notes 184) · **408 `implicitly has an 'any' type`** · ~~265 arity~~
   ✅ 2026-09-03 (plan-notes 183) **+ 183 arity still open** · ~~235 `left-hand side of an
   arithmetic operation`~~ ✅ 2026-09-03 (plan-notes 186) · **196 `No overload matches this call`**.
   Across the five landings the Test262 ratchet moved **10,513 → 7276 failed** and
   **40,688 → 43,925 skipped** with `passed` unchanged at **2379** throughout — the tests did not
   start passing, they moved from a checker lint to Stator's own schedule (the `STA12xx` skip
   column), which is the attribution §1.3's disjoint ranges exist to make. Per-landing evidence:
   [done.md](done.md) → Phase 5 step 2a.
   ~~The remaining buckets were swept 2026-09-04; four more codes landed (18050, 2403, 2695,
   8024/8029) and the strict-mode family was judged a **real refusal Stator keeps**.~~
   ✅ **the sweep is complete** (plan-notes 194, 196) — evidence in [done.md](done.md) → Phase 5
   step 2a. **All three (b) buckets have landed since** (plan-notes 272): 2683 went in as the
   OPTION `noImplicitThis: mode === 'ts'` (done.md → Phase 5 wave 4, dynamic `this`), 2769 as the
   overload-fallback acceptance (done.md → wave 4), and 2464 as a js-mode suppression with
   dynamic-path coercion. (b) is closed; the override-widening bucket it never named (TS2416,
   plan-notes 68) is owned by step 12(d). What is left after
   those is one shared blocker, not a set of buckets — see (c).
   (c) **[D4] The error-object model, and the buckets that sat behind it** (added 2026-09-04 from the (b)
   sweep; plan-notes 194).
   ~~**Check:** an `Error` object model in the runtime — constructor, `name`/`message`, the
   `instanceof` chain for the standard subclasses — proved by a golden that CATCHES a thrown builtin
   error and prints `name`, `message` and an `instanceof` result matching Node byte-for-byte~~
   ✅ **the model landed 2026-09-05** (plan-notes 195; evidence in [done.md](done.md) → Phase 5
   step 2a(c)) — five descriptors in `runtime/src/jsrt_error.c`, no new mechanism, STA4095 pinning
   the layout, and one WRONG ANSWER removed (`e instanceof Error` had compiled and answered false).
   **Still open under this step, now for three different reasons:**
   ~~2540 read-only assign~~ ✅ **landed 2026-09-05** in the same commit, which is the loop closing —
   (b) refused to suppress it precisely because the runtime could not build its answer, and now it
   compiles and the runtime raises Node's `TypeError`. ~~2704 read-only delete~~ ✅ **landed the same
   day but only as a RECLASSIFICATION** (plan-notes 196, measured): the `delete` operator has no
   lowering at all — no `DeleteExpression` case in `src/lower/` or `src/frontend/gate.ts`, no
   `jsrt_delete` — so dropping the checker's refusal moves the program from `STA0012` to
   `STA1214 (DeleteExpression)`. That is a legitimate §1.3 landing (checker lint → Stator's own
   schedule, naming the phase that owns the blocker) and **not** a claim that `delete` works; the
   operator is step-12 residue. · ~~**2790 `The operand of a 'delete' operator must be optional`**
   — a bucket the (b) sweep missed entirely, found by the same measurement (plan-notes 196): `delete`
   on a REQUIRED property, distinct from 2704's read-only one, a §1.2 violation whose JavaScript
   answer is a boolean, blocked on that same missing operator plus the shape question a fixed-shape
   object losing a field would ask.~~ ✅ **both delete buckets closed 2026-09-09** by landing the
   operator itself (plan-notes 210; evidence in [done.md](done.md) → Phase 5 step 2a(c)), which
   retires 2704's reclassification: `STA1214 (DeleteExpression)` is gone for every receiver the
   checker can type. · ~~**2304/2552 `Cannot find name` (1345 lines)**~~
   ✅ **landed 2026-09-05** (plan-notes 197; evidence in [done.md](done.md) → Phase 5 step 2a(c)).
   The gate needed no change after all — its global branch is guarded by `symbol !== undefined`, so a
   symbol-less identifier already fell through to `accept`, and it was the LOWERING that manufactured
   `STA4035`. Reading an undeclared name now throws a catchable `ReferenceError`, `typeof` answers
   `"undefined"` without throwing, and the three WRITE forms the suppression newly admitted were
   caught manufacturing `STA4034` and fixed in the same change — the TS2403 rule again, asked of 24
   syntactic positions instead of one fixture. · ~~**2488 `Symbol.iterator`**~~ ✅ **landed
   2026-09-16** (plan-notes 280; evidence in [done.md](done.md) → Phase 5 step 2a(c),
   unknown-iterable dispatch): js mode suppresses the checker's refusal and lowers `for-of`
   over any operand with no static walk through a `get-iterator` HIR node to the runtime
   GetIterator dispatch (`jsrt_get_iterator` — collections box, generators and stored
   iterators drive as-is, a user-iterable method resolves and runs, the rest throw Node's
   catchable `TypeError`), proved by `tests/golden/js/for_of_unknown.js` byte-for-byte and a
   both-modes decision pair (`subset_for_of_unknown_*`: `dynamic` in js, `error STA0012` in
   ts). ts mode keeps the refusal, and the gate there refuses only what the checker accepted
   (a custom `{ next() }` object, an `Iterable<T>` interface) so the STA0012 speaks alone; a
   `for-of` binding is not an annotation site, so the checker's recovery-`any` no longer
   buries it under STA1003.
   **2454 definite assignment** rejects an uninitialized annotated binding whose runtime value is
   `undefined`; it is **not TDZ**. True syntactic TDZ is 2448 (closure-mediated TDZ may have no
   checker diagnostic), and there is no runtime TDZ sentinel/check to convert. Suppressing 2454
   additionally requires sound dynamic method receivers rather than trusting the annotation
   (plan-notes 200, correcting note 195's premise).~~ ✅ **landed in wave 3** ([done.md](done.md)
   → Phase 5 wave 3: suppressed in js as a code plus binding widening; verified green in
   plan-notes 280 — `subset_definite_assignment_*`, both goldens). Both buckets are closed.
   · ~~**`missing.a = 1` and `missing[0] = 1` raise `STA4035`**~~ ✅ **fixed 2026-09-05**
   (plan-notes 199; [done.md](done.md) → Phase 5 step 2a(c), inferred JS namespaces).
   ~~**Check:** `typeof unresolvableName` answers `"undefined"` without throwing and a bare
   unresolvable reference throws a catchable `ReferenceError` whose `name`/`message`/`instanceof`
   match Node~~ ✅ 2026-09-05 (`tests/golden/js/reference_error.js`,
   `tests/golden/js/reference_error_write.js`). ~~**Check:** the panic-to-throw conversion lands with a
   golden that CATCHES each converted site~~ ✅ **2026-09-05** (plan-notes 200; evidence in
   [done.md](done.md) → Phase 5 step 2a(c), catchable property and iterator failures) — the nullish
   and primitive property sites and the iterator/generator receiver sites now throw Node's
   `TypeError`, caught by `tests/golden/js/property_errors.js` and
   `tests/golden/js/iterator_receiver_error.js`. The same conversion later reached the string-length
   builtins: `repeat`/`padStart`/`padEnd` throw a catchable `RangeError` matching Node instead of
   aborting (plan-notes 203; `tests/golden/{js,ts}/string_range_error`). The 2488/2454 buckets
   below were still open then, being not panics — both have since landed (2488: plan-notes 280;
   2454: wave 3). ~~**Check:** the two delete buckets (2704, 2790)
   land with the `delete` OPERATOR — lowering plus whatever
   answer a fixed-shape object gives when it loses a field — proved by a golden where `delete o.a`
   returns Node's boolean and the subsequent read answers `undefined`.~~ ✅ **2026-09-09**
   (plan-notes 210; evidence in [done.md](done.md) → Phase 5 step 2a(c), the `delete` operator) —
   `tests/golden/{ts,js}/delete_prop.*` match Node byte-for-byte. **The open half answered itself:**
   a fixed-shape object does not lose a field, it REFUSES — `STA1108` (never) in ts mode, `STA1205`
   (not-yet, Phase 8) in js, and `STA2007` at run time for an Unknown receiver that turns out fixed
   — the mirror of `STA2004`, lifted by the same dictionary-mode escape. In ts mode that refusal is
   nearly unreachable by construction: TS2790 demands an optional property and an optional property
   is exactly what makes a shape dynamic, so only a class field can reach `STA1108`.
   **Check:** each suppression lands with a both-modes decision fixture (the same source, `error` in
   ts and `dynamic` in js) and a golden proving js mode compiles it to Node's answer. The Test262
   ratchet moves in that commit **when a test's final classifier changes**; a harness file can carry
   several independent checker diagnostics, so removing an earlier one may only expose the next
   `STA0012` and leave the aggregate count honestly unchanged. In that case record the per-code
   before/after evidence in `plan-notes.md` rather than claim a numerical improvement that did not
   happen (plan-notes 182).
3. ~~Lower `var`: function-scoped binding, hoisting to the enclosing function (or module) scope,
   `undefined` init before the first statement runs, legal redeclaration folding to one slot.~~
   ✅ **landed** (2026-09-02, plan-notes 142).
4. ~~Dynamic lowering completion — Unknown property get/set, computed index, dynamic calls
   (`STA2006` at `file:line` for a non-function), and `==`/`!=` through `jsrt_loose_equals`.~~
   ✅ **landed** (2026-09-02, plan-notes 143) — STA4058 retired.
5. ~~Mixed-graph boundaries: a dynamic (Unknown) value reaching a checkable annotation is wrapped
   in `BoundaryCheck` at the EDGE — declaration, assignment, call argument, return.~~
   ✅ **landed** (2026-09-02, plan-notes 140, 144).
6. ~~JSDoc freebie test — a fully JSDoc'd `.js` module reports file verdict `static`,
   provenance `typed`.~~ ✅ **landed** (2026-09-02) — no compiler change was needed.
7. ~~Flip remaining js expected-fail + capstone golden.~~ ✅ **landed** (2026-09-02, plan-notes 146)
   — twelve fixtures flipped with honest verdicts; the rest wait on their owner steps, never
   bulk-flipped.
8. ~~The iterator protocol, and generators with it.~~ ✅ **landed** (2026-09-02, plan-notes 147–154)
   — `Symbol.iterator` as a stored value, `Symbol()` and `Symbol.for` stay `STA1212`; generator
   methods, async generators and `for await` stay `STA1201`; `yield*` and a custom `{next()}`
   object stay `STA1214`.
9. ~~Top-level await (`STA1208`).~~ ✅ **landed** (2026-09-02, plan-notes 155) — init order is
   Task 3.11's topological order, **not** Node's sibling-subgraph interleaving (a documented
   divergence, docs/MODES.md). `STA1208` is no longer emitted.
10. ~~Dynamic `import()` (`STA1207`).~~ ✅ **landed** (2026-09-02, plan-notes 156) — literal
    specifiers only; **computed specifier stays `STA1207`, owned by Phase 8 step 7**, and
    `import * as ns` stays `STA1214` (step 12).
11. ~~`Promise.prototype.then`/`catch`/`finally` and `new Promise(executor)` (`STA1216`).~~
    ✅ **landed** (2026-09-02, plan-notes 157) — combinator residue
    (`allSettled`/`any`/`race`/`withResolvers`/`try`) and a non-arity-1 constructor stay not-yet
    under `STA1216`.

12. **The lowering ladder's residue — `ts`-mode static language surface** (added 2026-09-01,
    plan-notes 136). Phase 3's rungs each landed a core and deferred its surface under
    `notYet(…, 3)` while Phase 3 was open; Phase 3 closed on 2026-08-30 having passed a Check about
    the eight rungs, not about what they deferred, and **70 gate sites outlived their owner** —
    still telling users, today, that rest parameters are "planned for Phase 3". This step owns
    them. It is not `js`-mode work and not the dynamic tier: every construct here is typed
    TypeScript with a statically known shape, which §1.1 promises will "eventually compile", in the
    product's DEFAULT mode. Land by family, each family flipping its `tests/subset/` rows out of
    expected-fail in the commit that lands it, never in bulk:
    ~~(a) **Parameter and binding forms** first, because every later family calls functions: rest,
    default, optional, uninitialized `let`, and shallow destructuring of parameters/declarations/
    catch.~~ ✅ **landed 2026-09-02** (plan-notes 158–161). **Residue:** nested patterns,
    rest-in-pattern, and default-in-pattern stay not-yet in this family.
    ~~(b) **Expression-position residue**: labels on anything but a loop or switch, capturing a
    variable declared inside a loop, `instanceof` against anything but a class name, assignment and
    compound assignment to a non-variable, `++`/`--` on a non-variable and in value position, and
    the binary/unary/statement catch-alls (`describeKind`).~~ ✅ **landed 2026-09-02**
    (plan-notes 164). **Residue:** accessor compound and `#n in o` stay not-yet (families (d) /
    private).
    (c) **[D3] Object literal forms**: shorthand, spread, method and accessor members; keys that are not
    identifiers. **Shorthand, non-identifier keys, and spread landed 2026-09-03** (plan-notes 181;
    evidence in [done.md](done.md) → Phase 5 step 12c, including the LAYOUT-vs-ENUMERATION order
    split it forced into `JSRTClass::key_order`).
    **Accessors landed 2026-09-04** (plan-notes 192; evidence in [done.md](done.md) → Phase 5
    step 12c accessors, including the two corrections to `docs/VALUE.md` §4.15 the implementation
    forced and the fixed-shape-position refusal it opened).
    **Methods landed 2026-09-12** (plan-notes 228; evidence in [done.md](done.md) → Phase 5 step 12c
    methods).
    **Computed keys landed 2026-09-12** (plan-notes 229; evidence in [done.md](done.md) → Phase 5
    step 12c computed keys).
    **Residue:** a spread of anything but a variable of fixed shape stays `STA1214`.
    (d) **[D5] The class member surface** — the largest family, and the reason rung 6 shipped as 6a/6b:
    static getters and setters, accessors with no body, computed and `#private` accessor names,
    index signatures, static initialization blocks, computed member names, a `#private` name an
    ancestor also declares, constructor and method overload signatures, a derived constructor that
    does not open with `super(...)`, more than one constructor, optional methods and fields, the
    override rules, anonymous classes, and the `extends` forms. The `this`/`super`/`new` position
    sites ride here (`this` in a static member or outside a class member; `super` on anything but
    an inherited method; `new` on anything but a named class).
    (e) **[D3] Values that need a closure or a class object**: ~~calling an arbitrary expression~~,
    ~~function declarations inside a block/loop/branch~~, ~~method values (`const f = o.m`)~~,
    ~~calling a class field~~, and ~~named function expressions~~ **landed** (evidence in
    [done.md](done.md) → Phase 5 step 12e); still open are an OPAQUE class use — anything but
    the in-place spellings (`new K`, `K.static`, `o instanceof K`, alias formation), which need
    the class object — and BARE `super` (the `super.m` tear-off landed as step 42; a `super`
    with no member is a JavaScript SyntaxError and stays refused).
    Method values use the method's own `JSRTClosure` with `has_receiver` so `jsrt_call` shifts when
    the receiver is omitted (`docs/VALUE.md` §4.16, plan-notes 208, 230); that is still not
    `Function.prototype.bind`'s two-slot `JSRTEnv` (which INSERTS a receiver where this DROPS one),
    which stays not-yet. A class used as a value and `super` as a value are blocked on the class
    object instead, which is family (d)'s. Named function expressions bind the function's own name
    inside its body only (plan-notes 231).
    (f) **[D4] Generics beyond monomorphization** last, because they multiply everything above.
    Constrained and defaulted type parameters specialize like any other call — the constraint
    is the checker's, the default fills what no call determines (`finishTuple`, `Unknown`
    when nothing does). Generic classes specialize per concrete tuple at each `new` site,
    inferred or explicit (evidence: done.md → Phase 5 waves 4–5). A generic function used as
    a value takes the canonical tuple, sharing its specialization with an undetermined call
    (step 41); explicit type arguments on a call or a `new` name the same specialization
    inference would; generic arrows and function expressions specialize under a module-scope
    `const` home. **An inline generic arrow or function expression passed directly as a call
    argument landed 2026-09-16** (plan-notes 279): it specializes at the parameter's function
    type under a position-derived key (`subset_generic_arrow_bare_*` now `static`, four new
    decision pairs, `tests/golden/ts|js/generic_inline.*` byte-for-byte).
    **Residue:** a homeless arrow anywhere else (`let`, a nesting, a branch, a spread, a
    constructor argument — no single parameter type to read), one (inline, named, or homed)
    whose body reads an enclosing scope or a same-file `let`/`const`/`var` (no binding a
    module-level specialization could read — plan-notes 280 refuses the named/homed shapes
    at the gate instead of failing downstream), a generic that escapes further (returned, stored — the
    dynamic tier), a generic call at a generic type (self-application — no monomorphic
    spelling), `instanceof` against a generic class (one descriptor per tuple), and the
    class-surface residue (a generic subclass of a generic base, raw or partial bounds —
    family (d)'s).
    **Check (step 12):** one golden fixture per family matching the pinned Node byte-for-byte; the
    decision-test rows for every construct named above out of expected-fail; and `gate.ts` emits no
    `not-yet` for any construct this step names.

13. ~~**Module-scope closures, and the two defects stacked in front of them**~~ ✅ **landed
    2026-09-04** (plan-notes 193) — evidence in [done.md](done.md) → Phase 5 step 13. A closure
    created at module scope capturing a loop-body binding read one shared global slot; the module
    now owns an environment for exactly those per-iteration bindings, so the loop's existing
    clone/commit runs there unchanged. Reproducing it first required fixing a console call in value
    position (returned `void` in C, so the generated file did not compile) and a `for-of` binding
    the lowering and the verifier typed from two different sources. Not step 12 residue: no
    `notYet` site ever named these — they are defects in shipped constructs.

14. ~~**[D3] Block scoping — a shadowed block binding shares the enclosing slot** (plan-notes 209).~~
    ✅ **landed 2026-09-11** (plan-notes 216; evidence in [done.md](done.md) → Phase 5 step 14).
    Alpha-renaming at the lowering: `src/lower/scope.ts` maps a source name to both its type and the
    HIR name a reference must use, and a declaration that would be a second home for its name in the
    slot space gets an unspellable one. The LEAK half — a name staying resolvable after its scope
    ended — landed separately and earlier the same day (plan-notes 215). **Check:** the four shapes
    (a `const`, a `let`, a parameter, a function declaration shadowed in nested blocks) match the
    pinned Node byte-for-byte in `tests/golden/js/block_shadow.js`; the
    `subset_block_function_shadow_*` rows are `static`; `gate.ts` emits no `not-yet` naming a
    shadowed block binding (the strings are gone). TDZ remains unmodelled and is NOT claimed.
15. ~~**[D4][P1] `await`/`yield` inside a per-iteration-env loop resumes into a C block**
    (plan-notes 223).~~ ✅ **landed 2026-09-11** (plan-notes 226; evidence in [done.md](done.md) →
    Phase 5 step 15). The loop's environment state lives in two frame SLOTS now — which `slotAt`
    resolves to the heap environment in an async or generator unit, where it survives a suspension —
    and `emitPark` writes `_jsrt_self->env = _jsrt_env;` before suspending, because the resume used
    to come back on the loop's base environment while the body read and wrote the iteration's clone.
    **Check:** `tests/golden/js/suspend_in_loop.js` — an async loop with a captured binding and an
    await in every iteration, nested loops, a `break` after an await, and a generator yielding from a
    captured loop — matches the pinned Node byte-for-byte at `-O2`, where the trap used to be.

16. ~~**An interface-typed value is a fixed layout whose HType is `unknown`**
    (plan-notes 223).~~ ✅ **landed 2026-09-11** (plan-notes 225; evidence in [done.md](done.md) →
    Phase 5 step 16). `isDynamicShape` accepts an interface (a class deliberately still does not —
    a class instance's declared layout is the point of ts mode), so an optional-property interface
    takes the shape table like its anonymous twin, and the five standard error interfaces map to
    `errorHType` in `tsTypeToHType` — with `isDynamicShape` excluding those five, whose optional
    `stack` would otherwise route `e.message` through the shape table. **Check:**
    `tests/golden/ts/interface_shape.ts` and `tests/golden/ts/error_family.ts` match the pinned Node
    byte-for-byte; the recorded choice (docs/SUBSET.md, plan-notes 225) is DYNAMIC for an interface
    with an optional property or an index signature.
17. ~~**A shadow-renamed function's display name leaks the HIR spelling into `console.log`**~~ ✅ **landed 2026-09-14** (plan-notes 247; evidence in [done.md](done.md) → Phase 5 step 17).
18. ~~**The `console` family takes exactly one argument**~~ ✅ **landed 2026-09-14** (`49d8193`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
19. ~~**Variadic built-in argument forms name Phase 5**~~ ✅ **landed 2026-09-14** (`49d8193`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
20. ~~**A dynamic receiver CRASHES where Node throws**~~ ✅ **landed 2026-09-14** (`49d8193`, new codes `STA2008`/`STA2009`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
21. ~~**Four runtime-semantics divergences from the 2026-09-11 hunt**~~ ✅ **landed 2026-09-14** (`49d8193`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
22. ~~**A computed object-literal key: methods are dropped and the read uses the wrong representation**~~ ✅ **landed 2026-09-14** (`49d8193`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
23. ~~**A shadowed class declaration shares the outer class's identity**~~ ✅ **landed 2026-09-14** (`49d8193`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
24. ~~**Optional chaining `?.` is silently ignored**~~ ✅ **landed 2026-09-14** (`49d8193`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
25. ~~**`this` in an arrow inside a class field initializer is not captured**~~ ✅ **landed 2026-09-14** (`49d8193`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
26. ~~**`js` mode rejects duplicate object literal keys**~~ ✅ **landed 2026-09-14** (`49d8193`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
27. ~~**`ToNumber(string)` diverges from the spec in six measured ways**~~ ✅ **landed 2026-09-14** (`49d8193`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
28. ~~**Fixed-shape objects ignore `OrdinaryOwnPropertyKeys`**~~ ✅ **landed 2026-09-14** (`6ed9f77`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
29. ~~**`ToString` of Map/Set/RegExp/Date/Error is `[object Object]`**~~ ✅ **landed 2026-09-14** (`6ed9f77`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
30. ~~**Five `console.log` inspector divergences**~~ ✅ **landed 2026-09-14** (`6ed9f77`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
31. ~~**`repeat`/`padStart`/`padEnd` length cap**~~ ✅ **landed 2026-09-14** (`6ed9f77`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
32. ~~**`Date.parse` ISO leniencies**~~ ✅ **landed 2026-09-14** (`6ed9f77`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
33. ~~**Object literal `{ __proto__: 1 }` is an own data property**~~ ✅ **landed 2026-09-14** (`6ed9f77`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
34. ~~**`for...of` never calls IteratorClose on abrupt exit**~~ ✅ **landed 2026-09-14** (`6ed9f77`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
35. ~~**Promise microtask ordering is one hop short**~~ ✅ **landed 2026-09-14** (`6ed9f77`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
36. ~~**An object-literal method that captures a local or parameter SEGFAULTS**~~ ✅ **landed 2026-09-14** (`6ed9f77`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
37. ~~**`js` mode turns suppressed checker diagnostics into internal errors**~~ ✅ **landed 2026-09-14** (`6ed9f77`; evidence in [done.md](done.md) → Phase 5 steps 18–38).
38. ~~**`for...in` over an array panics `STA4084`**~~ ✅ **landed 2026-09-15** (`5a83a1d`, plan-notes 257; evidence in [done.md](done.md) → Phase 5 steps 18–38).
39. ~~**Spread of an unknown value is a gate-verifier gap that throws `STA4082`**~~ ✅ **landed 2026-09-15** (`6f88a8b`; evidence in [done.md](done.md) → Phase 5 steps 39–40).
40. ~~**Lowering diagnostics mislabel the mode as `[ts]` under `--mode=js`**~~ ✅ **landed 2026-09-15** (`6f88a8b`; evidence in [done.md](done.md) → Phase 5 steps 39–40).
41. ~~**Bare generics as value**~~ ✅ **landed 2026-09-15** (`a84a970`; evidence in [done.md](done.md) → Phase 5 wave 5).
42. ~~**`super` as value**~~ ✅ **landed 2026-09-15** (`a84a970`; evidence in [done.md](done.md) → Phase 5 wave 5).
43. ~~**`extends` beyond a class declaration**~~ ✅ **landed 2026-09-15** (`a84a970`; evidence in [done.md](done.md) → Phase 5 wave 5).
44. ~~**Element/spread receiver hardening**~~ ✅ **landed 2026-09-15** (`a84a970`; evidence in [done.md](done.md) → Phase 5 wave 5).
45. ~~**Boundary widening stops at the call edge**~~ ✅ **landed 2026-09-15** (`2ac7e4d`; evidence in [done.md](done.md) → Phase 5 wave 6).
46. ~~**The decl×return combination needs a joint fixpoint**~~ ✅ **landed 2026-09-15** (`4445956`; evidence in [done.md](done.md) → Phase 5 wave 7).
**Check:** a mixed graph (typed `.ts` entry importing an untyped `.js` lib) compiles under `--mode=js` and matches Node byte-for-byte; a `js`-only program using `var`/hoisting/`==` matches Node; `stator explain` shows static/dynamic split per function; `ts`-mode behavior and binary sizes unchanged (regression-checked against Phase 3 baselines).

---

## 9. Phase 6 — Conformance and differential fuzzing (starts after Phase 3; Test262 needs Phase 5; then forever) — **D2 · P2**

This phase produces no language features. It produces **evidence** — a conformance number, a
divergence hunt, and measurements — and its output is only as good as its honesty, so every step
below is written against one failure mode: a green signal that proves less than it appears to. A
skipped test counted as a pass, a fuzzer that generates programs the compiler already handles, a
benchmark of the wrong answer computed quickly. Each step names the dishonest version it exists to
prevent.

The tasks are independent and the phase's Check has one clause per task.

**All four tasks have landed** (6.1, 6.2, 6.2a, 6.3); their evidence is in [done.md](done.md) →
Phase 6, and the titles stay here so `§9 Task 6.N` references resolve. The phase is **not closed**:
its Check's fuzzing clause says *≥1 h nightly with zero unexplained divergences* — met on the
nightly job's own output, cited here: 2026-09-14 (run 34819549697, 4316 cases, 0 divergences,
1h0m53s) and 2026-09-15 (run 34942356204, 4128 cases, 0 divergences, 1h1m50s), both green
(plan-notes 274). What keeps the phase open is Task 6.3's named residue (the regression
threshold's noise floor) below. Test262 tracking is the standing output of 6.1 and does not
close. Difficulty (§14 legend): the noise-floor residue is **D2** (the fuzzing clause was D1
and is met).

~~**Task 6.1 — Test262 runner.**~~ ✅ **landed 2026-09-03** — evidence in [done.md](done.md) → Phase 6.
First pinned number: **2379 passed, 10,513 failed, 40,688 skipped — 18.5%** over `passed + failed`,
ratcheted in `tests/test262/ratchet.json`. Three rules from it survive here because they are rules,
not history:

- A build that raised **nothing but** `STA12xx` is a **skip attributed to that code**, never a
  failure. §1.3 keeps the never and not-yet ranges disjoint so a test can tell intent from schedule;
  step 4 already said this for negative tests, and it is no less true for positive ones. A build
  that raised anything else stays a failure, so the skip bucket cannot swallow a real refusal.
- The **ratchet is the gate**, not `expected-fail.txt`. At 53,580 tests a per-test expectation file
  becomes an artifact nobody reads, and an unreadable list explains nothing. Unexplained failures
  are printed as a bounded sample plus a total; `passed` may not drop and `failed` may not rise.
- **Everything in the skip column must name a rule about the compiler.** A skip looks deliberate,
  which is exactly why a runner's own defects go there to hide: the first pass skipped 17,003 tests
  on `flags: [generated]` (a provenance note with no execution meaning) and reported 294
  `_FIXTURE.js` files — which INTERPRETING.md says are not tests — as tests with unreadable headers
  (plan-notes 176).

~~**Task 6.2 — Differential fuzzing.**~~ ✅ **built 2026-09-02, hardened 2026-09-03** — evidence in
[done.md](done.md) → Phase 6. `packages/tests/differential/` generates type-directed programs from
one seeded xorshift, weights the grammar at the regions the golden suite cannot enumerate, runs them
against the pinned Node byte-for-byte, minimizes divergences, and runs an hour nightly per
`.github/workflows/nightly.yml`. Three rules survive here because they are standing practice, not
history:

- **A generated program that fails to compile is a GENERATOR bug** and the generator gets fixed —
  unless the diagnostic is `STA4xxx` (internal error), which is a real finding: an exception
  reaching the CLI is always a compiler bug (`AGENTS.md`'s diagnostics conventions).
- **Never normalize output to make a comparison pass.** stdout is compared byte-for-byte against
  the pinned Node from `.node-version` and only that Node, and a timeout counts as a divergence
  (an infinite loop in emitted code is a bug, not a slow test) — the golden-test rule applies here
  identically.
- **Every divergence becomes a golden test in the commit that fixes it**, with the raw
  pre-minimization program in `tests/differential/corpus/`. Fixing the bug without landing the
  fixture is how the same divergence returns.

~~**Task 6.2a — Pin the ground truth's invocation.**~~ ✅ **landed 2026-09-08** — evidence in [done.md](done.md) → Phase 6.

~~**Task 6.3 — Benchmark harness.**~~ ✅ **built 2026-09-02, hardened 2026-09-03** — evidence in
[done.md](done.md) → Phase 6. Five compute programs (fib, nbody, JSON round-trip, string churn, and
the empty startup floor) verified against Node at record time so a wrong answer computed quickly
aborts the recording; engines discovered on `PATH` with an absent one written as `"absent"`; RSS
normalized to bytes with the raw value beside it; results appended per host; and
`tests/bench/README.md` **generated** by the weekly cron in `nightly.yml`. Two rules survive here:

- **Never quote a competitor's self-published figure as a measurement.** A number this harness did
  not produce on this machine is not a measurement and does not go in the file.
- **CI does not commit to `main`** — the owner's answer, 2026-09-04 (plan-notes 190). No
  write-scoped token, no bot commits on the default branch; the generated page is regenerated and
  committed by whoever runs `bench:record`, which is where the machine-local rule already puts the
  authority. Reopening this is a plan edit.

**[D2] Open residue — step 7's noise floor.** The regression gate compares the geomean against the newest
previous result for the same host and fails above `thresholdPercent: 20`. The step requires that
threshold to sit above a **measured** spread; what has been measured is one repeat on one host
(22.358 → 21.458 ms, **4.0%**, same commit — done.md) plus five repeats on a second host
(21.215–22.778 ms, **7.4%** max spread — plan-notes 246), and the 20% gate stands on both with
~3× headroom. Still open, narrowed twice: the Check names the machine that runs the weekly job,
and neither host is it — and the weekly-job machine is not a stable entity to repeat on. The
Sunday bench runs on ephemeral `ubuntu-24.04` VMs (a fresh VM per run; the 2026-09-13 run's
provisioner log reads Azure westus2, worker `4fa6f57c…`), and its result artifact does not
survive: that run recorded 5 programs and uploaded `benchmark-13` (1103 bytes), yet two days
later the run's artifact list is empty, so week-to-week repeats are not retrievable
(plan-notes 274). The concrete unblock is retention, not more local repeats: keep
`benchmark-*` artifacts (or land the weekly result on a non-main branch) until repeats
accumulate on the same image — then the Check's literal form can pass. Until then the 20%
gate stands on the two measured spreads (~2.7× headroom over the worst 7.4%).
**Check:** a handful of repeats of one commit
on the machine that runs the weekly job, the observed spread recorded in `plan-notes.md`, and the
gate set from it. A gate below the noise floor fires on noise, and an alarm that fires on noise is
one people learn to ignore — which costs more than having no gate at all.

~~**Task 6.4 — Plain `test` is the gate; `test:coverage` is on-demand only.**~~ ✅ **landed 2026-09-14** — evidence in [done.md](done.md) → Phase 6 Task 6.4.

~~**Task 6.5 — Pin the oracle: the ground truth is named, never inherited from the host.**~~ ✅ **landed 2026-09-14** — evidence in [done.md](done.md) → Phase 6 Task 6.5.

~~**Task 6.6 — In-process subset and golden runners.**~~ ✅ **landed 2026-09-14** — evidence in [done.md](done.md) → Phase 6 Task 6.6 (including the lowering-leak fix, plan-notes 242).

~~**Task 6.7 — `cli.test.ts` spawns in parallel.**~~ ✅ **landed 2026-09-14** — evidence in [done.md](done.md) → Phase 6 Task 6.7 (plan-notes 242).

~~**Task 6.8 — Stop paying for the duplicate ASan golden pass (or prove it free).**~~ ✅ **landed 2026-09-14 as option (a)** — evidence in [done.md](done.md) → Phase 6 Task 6.8 (plan-notes 252).

~~**Task 6.9 — Key the program cache on content, not mtime.**~~ ✅ **landed 2026-09-14** — evidence in [done.md](done.md) → Phase 6 Task 6.9 (plan-notes 245).

~~**Task 6.10 — The differential oracle must never record a divergence it cannot reproduce.**~~ ✅ **landed 2026-09-14** — evidence in [done.md](done.md) → Phase 6 Task 6.10 (plan-notes 253).

~~**Task 6.11 — The duplication gate is red, and blind to the differential harness.**~~ ✅ **landed 2026-09-14** — evidence in [done.md](done.md) → Phase 6 Task 6.11 (plan-notes 255).

~~**Task 6.12 — Pin the oracle exactly; the preflight compares majors only.**~~ ✅ **landed 2026-09-15** — evidence in [done.md](done.md) → Phase 6 Task 6.12 (plan-notes 268).

~~**Task 6.13 — The golden runner reports its skipped `intl_*` fixtures.**~~ ✅ **landed 2026-09-14** — evidence in [done.md](done.md) → Phase 6 Task 6.13 (plan-notes 253).

~~**Task 6.14 — A checker stack overflow must fail its test, never its shard.**~~ ✅ **landed 2026-09-14** — evidence in [done.md](done.md) → Phase 6 Task 6.14 (plan-notes 254).

**Standing decision — Bun is not a test runner (2026-09-14, plan-notes 241).** Measured on this host (Bun 1.3.14 vs pinned Node 26.x): subset −5%, spawn-heavy unit −37%, in-process parity — while adopting it silently redefines the oracle (`process.execPath`), breaks the lcov pipeline (Node-only flags), and weakens the `erasableSyntaxOnly` runtime guard (Bun transpiles what Node type-stripping refuses). Reopen only with new measured evidence per §15.4. Task 6.5 is the prerequisite that keeps the question askable.

**Check:** Test262 % visible and monotonically tracked; fuzzer runs ≥1 h nightly with zero unexplained divergences; benchmark page auto-updates; a shell whose bare `node` is off-pin cannot run CI silently (Task 6.2a); the unit gate runs without coverage (Task 6.4); the oracle never resolves to the host (Task 6.5).

---

## 10. Phase 7 — FFI ✅ COMPLETE (2026-09-16)

All three tasks landed and the phase Check is met. **Evidence: [done.md](done.md) → Phase 7.**
Titles stay here so `§10 Task 7.N` references resolve; the extern contract itself lives in
`docs/FFI.md` (authoritative), the codes in `docs/DIAGNOSTICS.md`, the matrix rows in
`docs/SUBSET.md`. Order was 7.1 → 7.2 → 7.3 and was load-bearing: 7.2 reuses 7.1's type
mapping in reverse, and 7.3 generates the declarations 7.1 consumes.

- ~~**Task 7.1 — Calling C from TS.**~~ ✅
- ~~**Task 7.2 — Exposing TS to C.**~~ ✅
- ~~**Task 7.3 — Bindings for existing headers.**~~ ✅

**Check:** ✅ **met 2026-09-15, re-verified 2026-09-16** — `examples/ffi/sqlite/`
(generated binding + demo + C `main()`), proven locally byte-for-byte with the pinned Node;
the CI proof is the ffi job's own run (plan-notes 271): an example that statically links
SQLite, queries it from TS, and is itself callable from a C `main()` — built and run in CI.

**Out of scope for v0, stated here so it is a decision rather than an omission** (each may return as
its own task, with a `plan-notes.md` entry and a `SUBSET.md` row):

| Not in v0 | Why |
|---|---|
| Struct **by value** across the boundary | ABI-specific layout/alignment per platform and per struct; by-pointer covers the real use cases |
| Varargs (`printf`) | No sound signature; each call site is a different function type |
| C++ symbols, name mangling, exceptions | A second ABI, not an extension of this one |
| C **calling back into** a JS closure | Needs a trampoline plus a GC root for the closure that outlives the call. Task 7.2's exported functions are the supported way for C to call in |
| Threads | v0 FFI stays single-threaded (Task 7.2 step 6); **OS threads + async bridge are Phase 10** (T10.2), which reopens this |

---

## 11. Phase 8 — The dynamic tier (gated; `js` mode only) — **[D5]**

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
   supplies the `lre_*` embedder callbacks once both halves are present. Acquisition is
   `node runtime/vendor/update.mjs quickjs-ng` (`pnpm run vendor:update`) with `quickjs.c`/
   `quickjs.h` added to that manifest — the same route the existing drop took, and it reaches the
   network (plan-notes 188 corrects the stale no-network constraint). The commit, not the transport,
   is the constraint.
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
   resolution needs a runtime module system, which is what this tier is. **Owner-confirmed
   2026-09-04** (plan-notes 190) — the conditional this step used to carry pointed at a
   confirmation that had never been recorded, so `STA1207`'s residue read as an open question for
   two days while step 10 was already closed against it. It is settled: the computed specifier is
   Phase 8's.
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

## 11a. Phase 9 — Zig memory core — **[D5 · P1]**

Creator's direction (plan-notes 238): rewrite the **memory core** of the C runtime in Zig. This
phase is **not sequenced after Phase 8** — §11 is gated on a named user and may never start;
T9.1 proceeds independently. §15.1's top-down rule does not apply here.

The Zig modules export the same C ABI and link into `libjsrt.a`. `jsrt_value.h` stays the
codegen↔runtime contract, and generated code stays C. Boehm GC stays: Zig calls bdw-gc through
its C ABI. Zig 0.16.0 is pinned in stator's `mise.toml`; a global 0.14.1 (if present) is
untouched. This reopens the settled C11-runtime decision (§15.4) on the creator's direction.

**Do not merge the `.worktrees/t9-1` Zig implementation from this planning change.** The
sources stay in that worktree until a follow-up PR.

### T9.1. Runtime memory core in Zig — **[D3]**

In scope:

- the GC glue (`jsrt_gc.c`);
- the allocation helpers behind `jsrt_value.h`;
- the shape tables (`jsrt_shape.c`);
- the growable buffers in print, JSON and string ops.

Steps:

1. Pin zig 0.16.0 in `mise.toml` and list it in `docs/TOOLCHAIN.md`. Teach the justfile to build
   the Zig objects into `libjsrt.a` for both the `runtime` and `runtime-asan` flavors.
2. Move `jsrt_gc.c` first.
3. Move the print/JSON/string buffers.
4. Move the shape tables.
5. Move the allocation helpers.

Every step keeps the golden fixtures and the runtime print corpus byte-identical.

**Check:** `pnpm run ci` is green, including `test:runtime` and `test:asan`. No C file still
holds moved code. `docs/TOOLCHAIN.md` lists zig.

**Progress** (worktree `.worktrees/t9-1`, branch `agent/t9-1`, plan-notes 238): steps 1–5 are in
place in that worktree. The Zig root `src/jsrt_mem.zig` builds one object, `jsrt_zig.o`, from
`jsrt_gc.zig`, `jsrt_buf.zig`, `jsrt_shape.zig` and `jsrt_alloc.zig`, declared for C in
`src/jsrt_mem.h`; `jsrt_gc.c` is deleted there. The string ops have no growable buffer, so
nothing there moved. Property semantics stay in `jsrt_shape.c` and builtin-specific constructors
stay with their builtins. Open for the creator: the `mlugg/setup-zig@v2` CI action. **Main does
not yet contain the Zig objects** — that is a separate PR.

### Language & library boundaries

Normative. Agents do not invent a second compiler language, a Rust crate, or a new runtime.
Full survey: plan-notes 239. Short form:

| Layer | Choice | Status |
|---|---|---|
| Compiler | TypeScript + `typescript` API in-process | settled |
| Emit / link | C; clang + `libjsrt.a` | settled |
| Generated code | C only | settled |
| Rust | nowhere, including MMTk | settled (§15.4) |
| Runtime | C11 + Zig memory core (T9.1 only) | creator direction (238) |
| `std` + OS threads | First-party `jsrt_std_*` + `std/*` modules; threads↔async bridge | Phase 10 (240) |
| Host compile parallelism | Same TS compiler; `STATOR_COMPILE_JOBS` / worker or process pool | Phase 10 T10.3 (240) |
| Vendored | QuickJS-NG libregexp/libunicode, fdlibm | settled |
| Optional native | Boehm; ICU (intl build) | settled |
| CLI-only | ink/react, dotenv; OTel opt-in | settled (187) |

**Zig (T9.1 only):** GC glue, alloc helpers, shape tables, growable buffers. Same C ABI into
`libjsrt.a`. Do **not** grow Zig into builtins, math, regexp, or codegen without a new plan task.

**Worth considering later — not tasks yet** (ride §12 / the named tripwire):

| Candidate | When |
|---|---|
| Ryū C vendor | §12 ladder (already scheduled; number print) |
| mimalloc/jemalloc | §12 rung 1, non-GC / post-precise-GC paths |
| simdutf (or similar) | only if UTF-16 ops profile hot |
| oxc-parser via napi | only if the `typescript` tripwire (§13) fires |
| LLVM `.ll` emit / LTO+PGO | measure before a new backend (§12 rung 6) |
| QuickJS-NG full interpreter | Phase 8 (already planned; same commit as libregexp) |

**Do not:** rewrite the compiler in another language (parallelizing it is T10.3, not a new language); adopt MMTk / a Rust GC without reopening
§15.4 with measured evidence; add a second RegExp engine beside libregexp; spread Zig beyond
the memory core without a new card.

Open for the creator: `mlugg/setup-zig@v2` as a CI dependency (noted in 238).

---

## 11b. Phase 10 — `std` library, threads ↔ async, parallel compiler — **[D5 · P1]**

Creator's direction (plan-notes 240). Three related cards, one phase: a low-level **`std`**
surface like a systems stdlib; **OS threads** that interoperate with the existing async /
Promise machinery; and a **threaded host compiler** so compilation uses multiple cores.

This phase is **not sequenced after Phase 8** — §11 is gated and may never start. T10.3
(host-only) can start anytime. T10.1 / T10.2 need a working runtime (Phase 4 ✅) and the
docs-first rule (§15.6). §15.1's top-down rule does not apply here (same exception shape as
Phase 9).

**Not a rewrite of the compiler into another language.** §15.4 / plan-notes 239 stay: the
compiler remains TypeScript + the `typescript` API. "Rewrite with threads" means parallelize
the existing pipeline (`node:worker_threads` / a process pool), not Zig/Rust/Go for codegen.

**Relationship to other phases.**

| Neighbor | How Phase 10 relates |
|---|---|
| Phase 7 FFI | `std` is **first-party** runtime C (`jsrt_std_*`), not user `declare` bindings. Phase 7's memory/string/error rules still apply when `std` calls libc. Phase 7's "single-threaded v0" is reopened **only** by T10.2 — FFI callbacks from foreign threads stay undefined until T10.2's bridge exists and 7.2's header is updated. |
| Phase 9 / T9.1 | Threads need a **threads-enabled Boehm** and per-thread stack registration. Prefer landing T9.1's GC glue (or the equivalent C path) before stress-testing T10.2; T10.1's non-thread modules do not wait on Zig. |
| Task 4.6 async | The resume machine, `jsrt_promise_subscribe`, and `jsrt_run_microtasks` are the async half of the bridge. Do not invent a second event loop. |
| §12 ladder | Host compile parallelism (T10.3) is a **developer-time** win; it is not a §12 runtime rung. Measure wall time of `stator build` before/after; keep only if geomean moves. |
| Test262 `SharedArrayBuffer` / `Atomics` / `Worker` | **Out of scope for T10.2 v0.** Those are JS-compat surfaces with their own not-yet codes. `std.thread` / `std.sync` are the Stator-native API; a later card may map SAB/Atomics onto the same primitives. |

### Design: how to implement this best

#### A. `std` is a typed module, backed by C — not Node polyfills

1. **Ship `docs/STD.md` before any code** (§15.6). The doc freezes: module path (`std` vs
   `@stator/std`), sync vs Promise APIs, error model (throw `Error` with `code` / `errno`, never
   silent `-1`), and which platforms are supported (POSIX first; Windows only when CI builds
   the runtime there).
2. **Surface shape** (systems std, deliberately smaller than Node):

   | Module | v0 contents | Notes |
   |---|---|---|
   | `std/env` | `get`/`set`/`has`, `args`, `cwd` | argv already exists for `main`; expose it |
   | `std/process` | `exit`, `pid`, `abort` | no signals yet |
   | `std/path` | `join`/`dirname`/`basename`/`isAbsolute` | pure TS or tiny C; UTF-16 ↔ bytes at the FS edge only |
   | `std/fs` | sync read/write/stat/mkdir; Promise twins | Promise twins are thin `async` wrappers that `await` a thread-pool job (see B) once T10.2 exists; until then sync-only is honest |
   | `std/time` | `nowMs`, `sleepMs` (sync) | timers in the microtask sense stay out until a macrotask phase exists |
   | `std/sync` | `Mutex`, `CondVar`, `Channel` | with T10.2 |
   | `std/thread` | `spawn`, `join`, `availableParallelism` | with T10.2 |

3. **Implementation layers:** `packages/std/*.ts` (types + thin wrappers users import) →
   compiler recognizes `std/*` as a value-import edge into runtime symbols → `runtime/src/jsrt_std_*.c`
   (or Zig only if a later card moves buffers there — **not** by default). No second RegExp, no
   Node `fs` semantics chase: match POSIX + document deltas in `STD.md`.
4. **Gate:** unknown `std/foo` is a hard error; partial modules use `not-yet` codes that name
   **Phase 10** as the blocker owner (§15.9).

#### B. Threads + async: one heap, main drains the queue, threads post completions

**Chosen model (settle in `docs/STD.md` + a short `docs/THREADS.md` before code):** shared-heap
**OS threads** with explicit sync, plus a **promise completion bridge** onto the existing
microtask queue. Rejected for v0: isolate-per-worker (heavier, worse "std" feel) and
green-thread M:N (second scheduler beside Task 4.6).

Rules that make async ↔ threads sound:

1. **The main thread owns `jsrt_run_microtasks()`.** Worker threads never drain it.
2. **`std.thread.spawn(fn, ...args)`** runs `fn` on an OS thread. `fn` must be a Stator function
   whose environment is heap-reachable (same discipline as async/generator envs). It may use
   `std/sync` and may call sync `std/fs`. It must not assume TLS frame state from main without
   installing its own `JSRT_FRAME`.
3. **`await thread.join()`** (or `thread.join(): Promise<T>`) parks on a Promise that the worker
   fulfills/rejects by pushing a completion into a **thread-safe MPSC queue**. Main's drain
   (already called after module body / at await boundaries) also pops that queue and settles the
   promises — one mechanism, no second loop.
4. **`std.async.runOnMain(fn)`** (name TBD in the doc) lets a worker schedule a thunk onto the
   main microtask queue. That is the only supported way for a worker to touch Promise reactions
   or non-thread-safe builtins.
5. **Blocking I/O from async code:** prefer `await std.fs.readFile(path)` implemented as
   spawn-join under the hood, so the main thread stays responsive. Do not block main inside an
   async function's sync prefix.
6. **GC:** build/link Boehm with threads; every spawn registers the thread with the collector;
   `_Thread_local jsrt_frame_top` already exists (`docs/VALUE.md`). A thread that allocates without
   registering is a use-after-free waiting to happen — the Check must include a multi-thread
   allocate/collect golden.
7. **Data races on JS objects are undefined** unless guarded by `std/sync` (same honesty as C).
   Document it; do not pretend the runtime is data-race-free.

**Out of v0 (named so they are decisions):** `SharedArrayBuffer` / `Atomics.wait` / `Worker` global;
thread cancellation; priorities; binding a C library's own thread pool without going through
`std.thread` (FFI 7.2 stays single-threaded until explicitly updated).

#### C. Parallel compiler: keep TS, parallelize cold stages, measure

Measured today: small-file `stator build` warm is often **clang-dominated**; large graphs used to
die in `hir/verify` Map copies (parent-linked scopes fixed that). So T10.3 is **not** "thread
everything" — it is a ladder with a measurement gate per step.

| Step | What parallelizes | Constraint |
|---|---|---|
| C0 | Inventory + `STATOR_COMPILE_JOBS` (default `availableParallelism()`, `1` = serial) | Telemetry spans already exist; record baseline wall times on a fixed graph |
| C1 | **Parallel clang** of independent `.c` units after emit | Safest: processes or a fixed worker pool; link stays serial |
| C2 | **Parallel emit** per module once HIR+verify for that module is done | Shared codegen tables must be immutable or cloned per worker |
| C3 | **Parallel lower/verify** per module | `typescript.Program` is **not** thread-safe — one Program per worker (process pool) **or** a single-threaded typecheck then sharded HIR. Prefer process pool over `worker_threads` if the API holds native state |
| C4 | Program / parse cache stays; workers inherit immutable snapshots | Never share a mutable checker across threads |

**Do not:** rewrite the compiler in Zig/Rust; put clang inside the runtime; claim a speedup
without before/after numbers on the same machine.

**Check (phase-level):** `docs/STD.md` + `docs/THREADS.md` exist; at least `std/env` + `std/path`
compile and run; one golden shows `spawn` + `await join` interleaving with `Promise` reactions;
`stator build` on a multi-file fixture is ≥1.5× faster wall-clock with `STATOR_COMPILE_JOBS>1`
than with `=1` on a quiet machine (or the note explains why the floor was not met and which
step remains). `pnpm run ci` green.

---

### T10.1. `std` low-level API (sans threads) — **[D4]**

Steps:

1. Write `docs/STD.md` (module path, error model, v0 table above). Add stub `SUBSET.md` rows /
   diagnostics that name Phase 10.
2. Wire `std/env` and `std/path` end-to-end (types → runtime → golden).
3. Add `std/process` (`exit`/`pid`).
4. Add sync `std/fs` + `std/time` (`nowMs`; sync `sleepMs` only).
5. Promise-flavored `std/fs` APIs: either `not-yet` until T10.2, or implemented as sync under a
   documented lie — **prefer not-yet** so async programs do not block main by accident.

**Check:** goldens for env/path/process/fs sync; subset rows match; no Node polyfill dependency.

### T10.2. OS threads + async bridge — **[D5]**

Depends on: T10.1's docs (threads chapters), Task 4.6 machinery, threads-enabled GC.

Steps:

1. Write `docs/THREADS.md` — the seven rules in Design B, plus Boehm build flags.
2. Runtime: thread registry, MPSC completion queue, `jsrt_thread_spawn` / `join` promise.
3. `std/sync` (`Mutex`, `CondVar`, bounded `Channel`).
4. `std/thread.spawn` / `join` / `availableParallelism`.
5. Bridge: `await join` + `runOnMain`; golden where a worker resolves a Promise the main `await`s,
   and an async function offloads CPU work via spawn-join.
6. Update Phase 7 Task 7.2 step 6 text/header when foreign threads may call in **only** via the
   bridge (or keep "undefined" until a 7.2 follow-up — record the choice in plan-notes).
7. Stress: N threads allocating under GC; ASan/UBSan where available.

**Check:** goldens byte-stable where Node has an analogue (Promise side); thread-only fixtures
use Stator's own oracle. Multi-thread GC stress does not crash under ASan.

### T10.3. Threaded / parallel host compiler — **[D4]**

Independent of T10.1/T10.2. Host Node only.

Steps:

1. Baseline: wall time of `stator build` on a fixed multi-file fixture at `STATOR_COMPILE_JOBS=1`
   with spans (frontend / lower / verify / emit / clang / link).
2. C1 — parallel clang; keep if ≥1.3× on that fixture.
3. C2 — parallel emit if emit shows in the profile.
4. C3 — sharded lower/verify via process pool if typecheck/HIR dominate; document the Program
   isolation choice.
5. CI: one job runs `STATOR_COMPILE_JOBS=2` smoke so races fail the build; default CI may stay
   serial for log readability.

**Check:** documented before/after numbers in plan-notes; `STATOR_COMPILE_JOBS=1` preserves
byte-identical emitted C for the fixture; CI green.

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

**Ryū rides here too** (owner's call, 2026-09-04, plan-notes 190, closing note 188's unclaimed
follow-up). §15.4 lists Ryū-exact number printing as settled and `docs/TOOLCHAIN.md` now records it
as fetchable and unfetched; what is NOT settled is when. `shortest_digits()` costs up to 18
`snprintf`+`strtod` pairs per number printed, and note 28 kept the swap contained to that one
function's body — but the corpus it would replace already matches Node byte-for-byte, so this is a
pure speed change with no correctness argument for jumping the entry criterion above. It becomes a
rung with a measured before/after when the harness exists, not a task now.

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
choice. Acquisition is a vendor drop with a `VENDOR.md` pin (plan-notes 188),
never a package fetch — the pin is what makes the version auditable — and never a global `malloc` interposition while Boehm is in
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
- **The HIR verifier's scope copying WAS the front end's ceiling — fixed 2026-09-13.**
`verifyFunction`/`verifyBlock` used to fork the whole enclosing binding map per scope (quadratic:
190 ms at 11k lines, 3.6 s at 45k, **21.5 s at 112k**); `b5da1d1` landed the prescribed
parent-linked scopes, and a 2026-09-14 re-measurement on scope-hostile synthetic inputs reads
≤1 ms at 10.9k/44.9k/112.1k lines (plan-notes 248). `src/cli/build.ts`'s "it costs one tree
walk" is true again. **Second ceiling, same shape one layer up — landed 2026-09-14.**
The lowering's `Scope.child()`/`functionScope()` duplicated the whole visible map per block and
per function (22→33→63 µs/line across the same three sizes); parent-linked scopes now link
instead of copying (`unitDeclared` sharing and the declare same-scope rule preserved), reading
15.8→12.1→11.0 µs/line with the many-tiny/few-big shape gap closed (50.6-vs-3.1 → 3.0-vs-2.9)
and HIR output byte-identical for identical input (plan-notes 249). Check shape, met: synthetic
ms/line flat, golden byte-for-byte, full gate green.
- **Perf-regression gate in CI** (Boa's lesson: conformance work silently taxes performance ~1–2%/release without a gate). The gate is built and shipping at 20%; what is still open under Task 6.3 is the *measured* spread it must sit above, because an alarm that fires on noise costs more than no gate.
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
| Zig memory core (Phase 9 / T9.1) | GC glue, alloc helpers, shapes, growable buffers | in progress in `.worktrees/t9-1` |
| `std` + threads + parallel compile (Phase 10) | stdlib, OS threads↔async, `STATOR_COMPILE_JOBS` | +4–8 wk (T10.1/T10.3), +6–10 wk (T10.2) |
| Optimization ladder §12 rows 1–5 | competitive perf story | +3–5 months |
| Conformance long tail | Porffor is at ~61% Test262 after years with a funded lead | years — the moat, budget honestly |

**Difficulty legend (`[Dn]` tags on open tasks).** The tag answers *how much has to be designed
before anything can be written*, not how many lines it is — which is why a one-line diagnostic swap
that needs a settled semantics decision outranks a large mechanical sweep. It is a sequencing aid,
never a licence to cut a Check (§2's estimates rule applies unchanged).

| Tag | Means | Shape |
|---|---|---|
| **D1** | hours | one file, existing mechanism, or citing evidence that already exists |
| **D2** | ~a day | one mechanism end to end, fixtures included; nothing to decide first |
| **D3** | days | crosses layers (lowering + emitter, or emitter + runtime); new fixtures in both modes |
| **D4** | 1–2 weeks | a new mechanism **plus** a semantics question to settle before code — the answer goes in `docs/` first (§15.6) |
| **D5** | weeks+ | a subsystem, or a family large enough that it lands in sub-parts with their own evidence |

Struck-through work carries no tag — `done.md` is the record. §12's ladder keeps its own **Effort**
column and is not re-tagged: those rows are not tasks until they are scheduled.

---

## 15. Agent execution protocol

1. Work top-down by phase; within a phase, by task order (steps are ordered by dependency). Do not start a phase before the previous phase's **Check** passes. Phase 0's tag gate requires a human; stop and ask there. **Exception:** Phase 9 / T9.1 and Phase 10 (`std` / threads / parallel compiler) are creator-directed and are not gated on Phase 8.
2. Every claim of "done" cites the Check command output (test run, CI link, benchmark diff). No Check, no done. A Check must also stay re-runnable at any later HEAD: an assertion **about** HEAD (`git describe --exact-match HEAD`, "the working tree is clean", a line number) is a point-in-time observation, not a Check, and it turns finished work into work that reports itself unfinished (plan-notes 135).
3. New facts that contradict this plan (a dependency changed, a measurement disagrees) → append to `plan-notes.md` with evidence; update this plan in the same change. The plan is living, but it changes by edit, not by drift.
4. Decisions already made here are **settled** — re-open only with new measured evidence in `plan-notes.md`: TypeScript-strict implementation using the `typescript` API in-process; C11 runtime with a Zig memory core (C11-only reopened on creator direction, plan-notes 238); emit C; generated code stays C; no Rust anywhere; NaN-boxing + `JSRT_FRAME` rooting; UTF-16 strings; Ryū-exact number printing; `Unknown` as first-class HType; cycle-rejecting ESM-only modules; the feature × mode matrix (`docs/SUBSET.md`); `ts` as default mode; `eval` permanently rejected in `ts` mode; the locked tsconfig.
5. When measuring against Node/Bun/QuickJS/competitors: record version, flags, hardware, and the exact program. Never compare against a number you didn't produce.
6. Ambiguity rule: if a task still leaves you guessing, the gap is a bug in this plan — record it in `plan-notes.md` and resolve it by editing the plan, not by inventing an undocumented convention in code.
7. `tsconfig.json` and the oxlint rules are load-bearing. Never weaken them to make code compile — fix the code, or follow rule 3.
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
- **v3.10** (2026-09-05): **§8 step 2a(c)'s first clause landed — `Cannot find name`, the largest
  bucket left (1345 Test262 lines).** Reading an undeclared name now throws a catchable
  `ReferenceError` with Node's wording and a working `instanceof`; `typeof` answers `"undefined"`
  without throwing, answered on the operator where §13.5.1.1 puts it. Two premises in this plan were
  corrected by the work: the gate needed no change (its global branch is guarded by
  `symbol !== undefined`, so the symbol-less identifier already reached the lowering, which was the
  thing manufacturing `STA4035`), and the suppression turned three WRITE forms into `STA4034` until
  the TS2403 rule was asked of 24 syntactic positions at once rather than one fixture. A pre-existing
  `STA4035` on `missing.a = 1` was uncovered, proved pre-existing (TypeScript auto-declares a JS
  global from a property assignment, so the checker never refused it), and left open rather than
  folded in. New: `ReferenceErrorRead`, `jsrt_reference_error`, STA4096. Evidence: plan-notes 197,
  `done.md` → Phase 5 step 2a(c), `pnpm run ci` green (378 unit tests; `subset: 354 fixtures — 325
  passed, 29 expected-fail, 0 failed`; `golden: 160 fixtures — 160 passed`; the same 160 under
  ASan/UBSan).
- **v3.9** (2026-09-05): **§8 step 2a(b) swept to completion and step 2a(c)'s Error model landed.**
  The (b) sweep judged every remaining `STA0012` bucket individually and landed four codes (18050,
  2403, 2695, 8024/8029), judging the strict-mode family a real refusal Stator keeps; 2403 produced
  the sweep's general rule by breaking it — **a suppression is finished only when the program it
  admits COMPILES**, since suppressing it alone turned `STA0012` into `STA4004`. Step 2a(c) then
  landed the Error object model with no new mechanism (five `JSRTClass` descriptors, `name`/`message`
  as ordinary slots, nothing in `jsrt_shape.c` changed, STA4095 pinning the shared layout) and
  removed a wrong answer: `e instanceof Error` had compiled and silently answered false. A 655-test
  Test262 slice (plan-notes 196) then checked the 2403 rule at scale — 115 remaining failures, all
  `STA0012`, **no `STA4xxx`** — and forced two honesty edits: 2704 landed only as a reclassification
  (`STA1214`, the `delete` operator has no lowering), and 2790 was a bucket the sweep had missed.
  `ratchet.json` was neither consulted nor moved: the slice is not the corpus. Evidence: plan-notes
  194–196, `done.md` → Phase 5 step 2a and 2a(c), `pnpm run ci` green (`subset: 352 fixtures — 323
  passed, 29 expected-fail, 0 failed`; `golden: 158 fixtures — 158 passed`; ASan/UBSan golden 158/158).
- **v3.8** (2026-09-04): **§8's landed steps archived** (golden rule 1). Steps 1–11's evidence narratives moved to `done.md` → Phase 5, leaving struck-through stubs that keep every number and title so `§8 step N` citations resolve; step 2a(a) and step 12(c)'s landed halves got the `done.md` sections they had never been given, and step 2a(b)'s bucket list now strikes the four codes that landed (2554/2322/2345/2362-2363) instead of narrating each in place. §8 shrank 1050 → 1000 lines and now states its open surface in one line: **step 2a(b) and step 12(c)–(f)**. The log itself had stopped at v3.7 (2026-09-02) while steps 8–12b, 2a, Task 6.1 and the fuzzer landed on 09-03 — those are recorded in `plan-notes.md` 147–186 and `done.md`, and this entry is the note that they never reached this list rather than a retroactive reconstruction of them.
- **v3.9** (2026-09-04): **the no-network constraint is retired** (plan-notes 188). A `fetch` of `quickjs.h` at the exact commit `runtime/vendor/quickjs-ng/VENDOR.md` pins returns HTTP 200 / 66,272 bytes, and Task 6.1 has been fetching the Test262 corpus over the same transport since 2026-09-03 — the constraint was falsified by work already in the tree. §11 step 3's acquisition clause had also contradicted itself (it forbade the network, then pointed at `runtime/vendor/update.mjs`, which fetches over HTTPS); it now names the script and the one real constraint, the SAME commit as the vendored `libregexp`. §12 rung 1 keeps the `VENDOR.md` pin rule without the reachability reason, and `docs/TOOLCHAIN.md` restates Ryū as fetchable-and-unfetched. **Phase 8's gate is untouched:** step 1's owner record still does not exist, and network availability removes an implementation obstacle from step 3, not the gate.
- **v3.10** (2026-09-04): **the spawn-heavy suites are parallel, and `ink` no longer loads on every spawn** (plan-notes 189). Task 6.1's process pool was lifted out of `tests/test262/run.ts` into `tests/support/parallel.ts` and reused by the subset and golden runners, which were still `spawnSync` in a `for` loop — extraction rather than a third copy, net **−19 lines**, `dupes` steady at 0.9%. Results stay indexed by item so a pooled run's failure list is diffable against a serial one's, and `STATOR_TEST_JOBS=1` restores the serial order without a stash. Separately, plan-notes 187 estimated the ink/react import at "tens of ms"; it measures **~1.6 s** and was paid at module scope by every process, including the `explain --json` and successful-`build` paths that never render — moving it inside `print` cut per-spawn cost **2349 ms → 843 ms**, and forced the `print`/`build`/`explain`/`run` async cascade plus `withSpanAsync` in `src/support/telemetry.ts` (the sync form ends a span the moment an async fn returns a pending promise). Measured uncontended at 16-way parallelism, both columns carrying the ink fix: **`test:subset` 109.7 s → 17.4 s (6.3×)**, **`test:golden` 151.0 s → 44.5 s (3.4×)**. No dependency added — `node:child_process` and `availableParallelism()`. Byte-exactness held: golden **147/147** on stdout *and* stderr.
- **v4.0** (2026-09-04): **the plan's six unmade decisions are made** (plan-notes 190). Every one was a sentence in this file telling the reader to decide something before proceeding, and none of them had been answered — two of them gating the phase that is open right now. Settled: the **Node pin stays 26.7.0** (notes #9, unresolved since 2026-08-29 and marked "settle it before Phase 6's fuzzing leans on it", which is the next task); **accessors** get a get/set pair on a shape entry, `docs/VALUE.md` §4.15 — following `docs/SUBSET.md`'s existing `dynamic` verdict for the row rather than inventing a competing one, so `JSRTClass` gains nothing — unblocking §8 step 12(c)/(d); **method values** need no bound closure at all, §4.16 — `const f = o.m` does not bind in JavaScript, so the method's own `JSRTClosure` is the answer and the second closure representation step 12(e) was told to expect is reserved for `Function.prototype.bind` — unblocking step 12(e); **CI does not commit benchmark results to `main`** (Task 6.3 step 6); **Ryū rides §12** rather than becoming a task (note 188's unclaimed follow-up); and **the computed specifier of `import()` is confirmed Phase 8's** (§11 step 7's "only if owner-confirmed" pointed at a confirmation nobody had recorded). No code changed: this is §15.6 applied to the plan's own backlog of deferred judgment.
- **v4.1** (2026-09-04): **plan-notes 187's written-down remaining work verified, and two green-signal hazards found and planned (plan-notes 191).** The uncommitted 187 tree ran its remaining suites under the pinned Node: unit **367/367** (telemetry 3/3), subset **342 — 311 passed / 31 expected-fail / 0 failed**, golden **147/147** (also under ASan/UBSan), coverage 90.04%, dupes 0.9%, leak plateau 3024 KB. First hazard: the host shell resolves bare `node` to mise's `node/lts` (24.20.0) ahead of the shims while the pin is 26.7.0 — the golden runner diffs against `process.execPath`, so pre-fix "green" runs used the wrong oracle, and `--test-coverage-include-all` exits 9 under 24. 187's "mise trust gap" misattributed it; the PATH order is the mechanism. New **Task 6.2a** fails CI fast when bare `node` is off-pin. Second hazard: the builtins dashboard drifted RED — `Promise.prototype.then/catch/finally` and `Object.freeze`/`isFrozen` landed with step 11 (`b8a0ac8`) but `builtins_coverage.json` still claims `[]`, so `test:builtins` reports `Promise.prototype: 0/3 (0%)` while golden proves all three; the dashboard checks stale-green claims but has no red-direction check. §8 gains **step-12 bookkeeping debt**: cite the landed fixtures, write the js-column freeze twin, and add a unit check cross-referencing the table against the runtime's exported `jsrt_<ns>_<member>` symbols so implemented-but-unclaimed members fail the build. Neither was fixed in place — the session's instruction was to plan them and stop.
- **v4.2** (2026-09-05): **§8 step 2a(c)'s remaining residue narrowed to what is really left.** Two
  landings, both archived in `done.md` → Phase 5 step 2a(c): `missing.a = 1` / `missing[0] = 1` no
  longer raise `STA4035` (plan-notes 199 — a TS-inferred expando namespace is not a runtime
  binding, one lowering predicate shared by reads, writes, `typeof` and receiver typing), and the
  "panic-to-throw" Check landed for the sites that actually were panics (plan-notes 200 — nullish
  and primitive property access and the iterator/generator receiver casts now throw Node's
  `TypeError`; a JS function whose `@returns {Generator}` lied had SIGSEGVed in `for-of`). That
  work corrected note 195's premise: **2454 is definite assignment, not TDZ**, and there is no
  runtime TDZ check to convert; 2488 needs runtime `GetIterator` dispatch, not a throw. Both stay
  open with the corrected reasons, as does the `delete`-operator Check. Emitter side effect: every
  dynamic property/index read, read-modify-write, and `Object` static call now roots its result and
  checks pending, and `Object.assign`, `JSON.stringify` and `console.table` snapshot keys rather
  than entries so getter/setter ordering matches Node. Evidence: `pnpm run ci` green (383 unit tests; `subset: 356 fixtures — 327 passed,
  29 expected-fail, 0 failed`; `golden: 163 fixtures — 163 passed`; the same 163 under ASan/UBSan).
- **v4.3** (2026-09-07): **the panic-to-throw conversion reached the string-length builtins**
  (plan-notes 203). `String.prototype.repeat` with a negative or infinite count, and any
  `repeat`/`padStart`/`padEnd` whose result exceeds the 2^31−1 length cap, threw `STA2005` (a loud
  abort) because the panics predated the throw protocol; they now raise a catchable `RangeError`
  matching Node byte-for-byte — message and all (`Invalid count value: <original arg>`, `Invalid
  string length`). The op table gained a `throws` flag and a `stringOpCanThrow` predicate so the
  emitter emits each as a checked statement with a pending check to the landing pad, the same
  discipline callbacks already follow. `STA2005`'s remaining string clause is `normalize` with a bad
  form; DIAGNOSTICS.md and SUBSET.md updated to match. Evidence: `pnpm run ci` green (subset `356 —
  327 passed, 29 expected-fail, 0 failed`; golden `165 — 165 passed`, the same 165 under ASan/UBSan;
  leak plateau 3040 KB; String.prototype 32/32). New goldens: `tests/golden/{js,ts}/string_range_error`.
- **v4.4** (2026-09-09): **Phase 6's built tasks archived — the plan had described finished work as
  unstarted** (plan-notes 207). Tasks **6.2** (differential fuzzing) and **6.3** (benchmark harness)
  landed on 2026-09-02 (`c2e621b`) and were hardened on 2026-09-03 (`78a5bf3`, with plan-notes
  177–179 writing them up), yet §9 still carried both as open records with their full step lists —
  step 6.2.1 literally instructing an agent to create a directory that had existed for a week —
  and `done.md` had no record of either. Both are now struck stubs pointing at `done.md`, keeping
  only what stays **normative**: the generator-bug rule, the never-normalize rule, and
  divergence-becomes-a-fixture for 6.2; the no-competitor-figures and no-CI-commits rules for 6.3.
  Re-verified before archiving, on the pinned Node at `4956428`: `differential --count=12` → 24
  cases, 0 divergences; `bench:record` → 5 programs, page generated (stator 22.36 ms · node 59.29 ·
  bun 20.00 · four engines absent). Doing 6.3 step 7's own measurement produced the one **residue
  left open with its own Check**: the regression gate ships at 20% against a spread measured once on
  one host (4.0% between two recordings of the same commit), which is above the only noise anyone
  has measured but not above a known floor. **Phase 6 stays open** — its Check's fuzzing clause
  passes on a nightly run's own output, and the scheduled job plus a local run is not that. Also
  recorded rather than fixed: §16 has duplicate `v3.9`/`v3.10` entries from parallel sessions
  appending at once (nothing outside this file cites a log version).

- **v4.5** (2026-09-09): **§8 step 12(e)'s receiver-free half landed, and the family's "settled"
  representation turned out to be settled for one case only** (plan-notes 210, 209). Calling an
  arbitrary expression and function declarations inside a block/loop/branch are struck; their
  evidence is in [done.md](done.md) → Phase 5 step 12e. The first was a gate refusal with nothing
  behind it — HIR, verifier and emitter were already general. The second needed the emitter to
  initialise a hoisted binding when its BLOCK is entered rather than when the enclosing body is,
  plus all three layers agreeing that a `switch`'s clause list is one scope. Implementing against
  `docs/VALUE.md` §4.16 is what found the hole in it: a method value is the method's own closure
  only for a **zero-argument** call, because `jsrt_arg` fills missing arguments from the right and
  the receiver is on the left — `const g = o.add; g(1, 2)` binds `this = 1, a = 2, b = undefined`
  where Node gives `this = undefined, a = 1, b = 2`, and the closure's arity counts the receiver
  (both measured). §4.16 carries the correction; step 12(e) now names it as the blocker for method
  values and calling a class field instead of "a bound closure nothing here builds", which was never
  the obstacle. §8 also gains **step 14**: block scoping is not modelled at all — a shadowed block
  binding shares the enclosing slot, so `const x = 1; { const x = 2; }` reads the outer `x` back as
  2. That is older than this phase and independent of step 12, so it is a step like 13 rather than
  residue; the nested-declaration landing ships with a narrow refusal for exactly the shadowing case
  so it adds no new silent miscompile, and step 14 removes both together.

- **v4.7** (2026-09-13): **Phase 10 card — `std`, threads↔async, parallel host compiler** (plan-notes 240). Creator-directed, not gated on Phase 8. `std` is a systems-style first-party library (docs-first), not a Node polyfill. Threads are shared-heap OS threads with a promise completion bridge onto Task 4.6's microtask queue; SAB/Atomics/Worker stay out of v0. "Rewrite the compiler with threads" means `STATOR_COMPILE_JOBS` + parallel clang/emit/lower on the existing TypeScript host — not a new compiler language. Phase 7's single-threaded FFI caveat now points here.

- **v4.6** (2026-09-13): **Phase 9 / T9.1 is now a main-tree card** (plan-notes 238, 239). The runtime is C11 with a Zig memory core — C11-only reopened on the creator's direction, not measured evidence. Generated code stays C; Rust stays forbidden. The language & library survey (239) is the standing boundary so agents do not invent a second compiler language, MMTk/Rust, or Zig past the memory core. Implementation remains in `.worktrees/t9-1` until a follow-up PR; this revision is plan/docs/notes plus the mise Zig 0.16.0 pin.

- **v4.8** (2026-09-14): **test-speed cards.** §9 gains Tasks 6.4–6.7 (plain-`test` gate, oracle pin, in-process runners, parallel `cli.test.ts`) plus the standing decision that Bun is not a test runner — all from the 241 measurements. 6.4 executes immediately; 6.5→6.6→6.7 in dependency order.
