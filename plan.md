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

**Repo layout (fixed):**

```
plan.md AGENTS.md plan-notes.md NICHE.md          # root
docs/    MODES.md SUBSET.md DIAGNOSTICS.md VALUE.md NUMERIC.md HIR.md TOOLCHAIN.md
src/     cli/  frontend/  hir/  lower/  passes/  codegen/  support/
runtime/ include/jsrt_value.h  src/  vendor/  Makefile     → runtime/build/libjsrt.a
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

**Check (machine-verifiable):** `NICHE.md` exists with the three required elements; `git describe --tags --exact-match HEAD` succeeds on its commit with tag `phase-0-approved`.

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
   The Biome config (`biome.json` — format checking folded into `lint`, warnings escalated), the `src/` skeleton (whose `build`/`explain` report honest not-implemented diagnostics), the runtime Makefile, the npm scripts, `.github/workflows/ci.yml`, and `./ci.sh` (the CI until a remote exists) are all in place — the files themselves are now the reference; AGENTS.md carries the command list.

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

## 7. Phase 4 — Runtime v1 (C11; parallel with Phase 3)

~~**Task 4.1 — Objects.**~~ ✅ Landed 2026-09-01. Evidence: [done.md](done.md) → Phase 4,
Task 4.1. The last slice was the **array with properties** the phase exit criterion named:
`JSRTArray` carries the dynamic object's property table, and `RegExp.prototype.exec` and
`String.prototype.match` landed on it (plan-notes 120).

**Task 4.2 — Builtins, driven by golden tests.** `Math`, `JSON`, `String.prototype` (~30 hot methods), `Array.prototype` (same), `Object`, `Map`, `Set`, `console`. A builtin counts as implemented when ≥1 golden test exercises it and matches Node. Coverage table `tests/golden/builtins_coverage.json`, rendered in CI (Porffor-style). New builtins enter via `SUBSET.md` + tests first, never ad hoc.
Until this task lands, every global except `console.log` and `undefined` is deferred at the **gate** with a `not-yet` naming this phase — `String`, `NaN`, `Math`, `globalThis` and the rest used to be accepted and then hit `STA4035` in the lowering, which is an internal error raised by legal source (plan-notes 61). The three spellings that only mention a global name (a type position, a property name, and `console` in `console.log`) stay accepted, pinned by `tests/unit/gate.test.ts`.

**In progress.** The landed slices — Math, String, Array, console, Object, JSON, callback
methods, `Map`/`Set` and the ES2025 set operations — are recorded in [done.md](done.md) → Phase 4,
Task 4.2. `pnpm run test:builtins` reports **165/196** deterministic surface members, with Math
42/42 plus one nondeterministic proof for `Math.random`, `String.prototype` at 31/32 and
`RegExp.prototype` at 13/15.
**Still open:** `Object` 6/13, `Date` (STA1210) has no implementation, and the four remaining
`console` members. `RegExp.prototype` is DONE for everything this phase owns — the eleven data
properties and `toString` landed 2026-09-01 (plan-notes 121), leaving `compile` (Annex B legacy,
variadic arity) and `unicodeSets` (declared in lib.es2024; this project pins `lib: ["es2023"]`, so
the checker refuses the read), neither of which is a Phase 4 blocker.

**`Date` joins this task's list (2026-09-01, plan-notes 116).** The list above enumerates `Math`,
`JSON`, `String.prototype`, `Array.prototype`, `Object`, `Map`, `Set` and `console` — not `Date` —
while `STA1210`'s note in `docs/DIAGNOSTICS.md` claimed "Phase 4 Task 4.2" as its owner. It was
owned by nobody, and it is not on the dashboard at all. It is a builtin and it is Phase 4; it is
named here now.

**Determinism carve-out (2026-09-01, plan-notes 116).** This task's bar — "a builtin counts as
implemented when ≥1 golden test exercises it and matches Node" — is UNMEETABLE BY CONSTRUCTION for a
member whose result is nondeterministic. `Math.random`, `Date.now()` and zero-argument `new Date()`
cannot match Node byte-for-byte, ever. Left as written, the dashboard counts them missing forever
and `Math` can never exceed 42/43, so the phase exit below could never be reached. These members
land with a different proof — a range/property assertion in `tests/unit/`, or the runtime print
corpus — and `builtins_coverage.json` marks them `nondeterministic` rather than counting them
against coverage. The rule is unchanged for every member that CAN be pinned to Node; this is a
carve-out for members the harness cannot express, not a lowered bar.

~~**Task 4.3 — RegExp.**~~ ✅ Landed 2026-08-30. Evidence: [done.md](done.md) → Phase 4,
Task 4.3. The remaining `exec`/`match` surface is owned by Task 4.1's array-properties work; the
iterator-shaped `matchAll` belongs to Phase 5 step 8.

~~**Task 4.4 — Intl/ICU.**~~ ✅ Landed 2026-08-30. Evidence: [done.md](done.md) → Phase 4,
Task 4.4.

~~**Task 4.5 — GC hygiene tests.**~~ ✅ Landed 2026-08-30. Evidence: [done.md](done.md) →
Phase 4, Task 4.5.

~~**Task 4.6 — `async`/`await` (generators deferred to Phase 5).**~~ ✅ Landed 2026-08-30.
Evidence: [done.md](done.md) → Phase 4, Task 4.6. Generators are Phase 5 step 8's iterator
protocol work, not an unfinished part of this task.

**Task 4.7 — Audit every not-yet phase pointer** (added 2026-09-01, plan-notes 116). `STA1214` is
parameterized — its message names the delivering phase per construct — and **58 call sites in
`src/frontend/gate.ts` hardcode phase 4**, from `Promise.${method} is not yet supported` to `an
async method is not yet supported`. Phase 4 is closing, so each of those is a claim that will be
false the moment it does. Several are already known wrong: the `Promise` ones belong to Phase 5
step 11 under `STA1216`, the async-method one to Phase 5. Walk all 58, give each the phase that owns
its actual blocker, and add a test that fails when a not-yet diagnostic names a phase already marked
complete — which is the check that would have caught `STA1201`, `STA1207`, `STA1208` and `STA1214`
without anyone reading the table.

**Rule this establishes (§15, applies from here on):** a `not-yet` diagnostic names the phase that
owns its **blocker**, never the phase that happens to be open. When a phase closes, every code
naming it is either delivered or reassigned in that same change — a not-yet code pointing at a
finished phase reads as a schedule and is a dead end (plan-notes 112).

**Check:** runtime unit tests + ASan/UBSan clean + the leak test; builtins dashboard renders in CI; an async golden test (`await` chain + `Promise.all`) matches Node.

**Phase exit criterion (added 2026-09-01, plan-notes 116).** This phase had a Check but no scope
boundary, so "is Phase 4 done?" was unanswerable — and four not-yet codes named it as their
deliverer while it was closing. The boundary is now explicit. **Phase 4 exits when the dashboard
shows every surface member whose blocker Phase 4 OWNS:**

- **`Math`** — all deterministic members are now covered by fdlibm and the dashboard; `Math.random`
  is covered by the determinism carve-out proof.
- **`Object`** — `assign`, `create`, `freeze`, `isFrozen`: shape work, on Task 4.1's machinery.
  `defineProperty`, `getPrototypeOf` and `setPrototypeOf` are **not** Phase 4 — they are the
  descriptor and prototype-chain surface `STA1204` already assigns to Phase 8.
- **`console`** — `table`, `time`, `timeEnd`, `trace`.
- **`RegExp.prototype`** — ✅ **met.** The array-with-properties half landed with Task 4.1
  (plan-notes 120: `exec`, `String.prototype.match`), and the DATA property surface with Task 4.2
  (plan-notes 121: the eleven properties of §22.2.6 plus `toString`, on a `REGEXP_FIELDS` table
  beside the method table). 13/15. The two that remain are NOT this phase's: `compile` is Annex B
  §B.2.4 legacy whose optional second argument a fixed-arity op table cannot express, and
  `unicodeSets` is unreachable while `tsconfig.json` pins `lib: ["es2023"]` — the property is
  declared in lib.es2024, so the checker refuses the read before the gate sees it, and raising
  `lib` admits every other ES2024 addition at the same time. `String.prototype`'s iterator-shaped
  `matchAll` remains Phase 5's.
- **`Date`** — newly owned by Task 4.2 above.

Everything else still missing belongs to a later phase and is named with its owner in §8: the
`keys`/`values`/`entries` triple, `for`-`of` over non-arrays, `function*`, and
`String.prototype.matchAll` (it answers an **iterator**, which is why it splits from `match`) go to
Phase 5 step 8; `Promise.prototype.then`/`catch`/`finally` and `new Promise(executor)` to step 11
under `STA1216`; the descriptor/prototype surface to Phase 8.

---

## 8. Phase 5 — `js` mode, and the language surface Phase 4 deferred (est. +4–6 weeks; needs Phase 4's shapes/ICs)

Until here, every pipeline stage was built `ts`-mode-first but mode-agnostic below the gate (§0.8). This phase turns on the second policy.

The title gained its second half on 2026-09-01 (plan-notes 116). Steps 8–11 are not `js`-mode work:
they are language surface that needs one more mechanism, which Phase 4 deferred without naming an
owner. They are here because the mechanism each one waits on is **lowering** work, not runtime work,
and Phase 4 is the runtime phase. If this phase starts feeling like a bucket, that is the signal to
split steps 8–11 into their own phase — do it by plan edit (§15.3), not by drift.

Steps:
1. Frontend: `allowJs` + `checkJs`-style inference in the `ts.Program`; per-function "typed | inferred | dynamic" provenance recorded into HIR (drives boundary insertion and `explain` output).
2. Gate: switch the diagnostic table by mode — `any` becomes dynamic, `var` becomes legal, `.js` files accepted; `eval` flips from never(ts) to not-yet(js).
3. Lower `var`: function-scoped binding, hoisting, `undefined` init; decision + golden tests (classic hoisting pitfalls, loop-var closure capture).
4. Dynamic lowering completion: property access/call/index on `Unknown` receivers through shapes + ICs (Task 4.1); `==` dynamic path per `NUMERIC.md`.
5. Mixed-graph boundaries: imports from `.js` into `.ts` get boundary checks against the declared/inferred type (same machinery as Task 3.5); a lying JSDoc produces a located runtime type error — add a golden test proving it.
6. JSDoc freebie test: a `.js` file with correct JSDoc types stays on the static path — assert via `stator explain` that its functions report `static`.
7. Flip all `js`-column decision tests from expected-fail; add `tests/golden/js/` including one real ~200-line untyped utility library.
8. **The iterator protocol, and generators with it** (inherited from Task 4.6, which delivered `async`/`await` and deferred the rest — see plan-notes 112). One blocker, **four** surfaces: `for`-`of` over anything but an array (a string, `Map`, `Set` or user iterable — **`STA1214`**, and note that for-of over an array already works, so this step narrows that code rather than clearing it), the `keys`/`values`/`entries` triple that `Array.prototype`, `Map.prototype` and `Set.prototype` are each missing, `String.prototype.matchAll` (it answers an iterator, which is what splits it from `match` — `match` stays Phase 4), and `function*` (**`STA1201`**). Generators are last because they are the only one that also needs a state machine, and Task 4.6 already built that half — a `yield` differs from an `await` in who it answers (its caller, not a scheduler), not in how it suspends. `STA1201` names this phase.
9. **Top-level await** (**`STA1208`**, moved here from Phase 4 on 2026-09-01). The gate's message
   already names the blocker exactly — "a module body has no resume point to suspend into" — and
   Task 4.6 built resume points for functions. This step makes the module init function an async
   unit, which also forces the question the whole-program model has so far avoided: what a
   suspending module body means for the topological init order Task 3.11 established.
10. **Dynamic `import()`** (**`STA1207`**, moved here from Phase 4 on 2026-09-01). Its old note said
   it "cannot land before async/await"; async landed and it did not, because the real blocker is a
   **module namespace object** — an object whose shape is the module's export list. With a LITERAL
   specifier the target is already in the whole-program graph, so this is shape work plus an
   already-resolved promise, and it belongs here. With a COMPUTED specifier it needs runtime module
   resolution the whole-program model does not have: that half is Phase 8, and the split needs owner
   confirmation before either half is built.
11. **`Promise.prototype.then`/`catch`/`finally` and `new Promise(executor)`** (**`STA1216`**,
   already assigned here). Both wait on the same thing: a handler's throw must become a rejection,
   which needs a runtime-level catch around user code.
**Check:** a mixed graph (typed `.ts` entry importing an untyped `.js` lib) compiles under `--mode=js` and matches Node byte-for-byte; a `js`-only program using `var`/hoisting/`==` matches Node; `stator explain` shows static/dynamic split per function; `ts`-mode behavior and binary sizes unchanged (regression-checked against Phase 3 baselines).

---

## 9. Phase 6 — Conformance and differential fuzzing (starts after Phase 3; Test262 needs Phase 5; then forever)

**Task 6.1 — Test262 runner** (`js` mode — Test262 files are `.js`; `ts`-mode conformance is carried by decision/golden suites). The runner reads each test's `features:` frontmatter and skips any feature not in the subset matrix; skipped tests are **counted and reported by feature** (`450 passed, 120 skipped (async: 80, proxy: 40), 5 failed`), never silently dropped. The % is CI-visible on every commit (Porffor's model — conformance as the public heartbeat).

**Task 6.2 — Differential fuzzing.** Generate random programs within the subset (grammar-based generator first, coverage-guided later) — typed programs for `ts` mode (can start right after Phase 3), untyped for `js` mode; run compiled vs pinned Node, diff outputs. Every divergence becomes a golden test.

**Task 6.3 — Benchmark harness** (weekly, results committed): startup time, binary size, RSS, and a compute set (fib, nbody, JSON round-trip, string churn) vs Node, Bun, QuickJS, and — where installable — Perry/scriptc/Static Hermes. Record version, flags, and hardware with every number. **Never quote a competitor's self-published figure as a measurement.**

**Check:** Test262 % visible and monotonically tracked; fuzzer runs ≥1 h nightly with zero unexplained divergences; benchmark page auto-updates.

---

## 10. Phase 7 — FFI (est. +4–6 weeks)

Research verdict: only Static Hermes has bidirectional, header-driven FFI — and even there the binding generator is an experimental in-tree script. A differentiator worth building properly; emitting C makes it natural.

**Task 7.1 — Calling C from TS.** `declare` + a marker (mirroring `$SHBuiltin.extern_c`) lowers to a direct call — no boxing for primitives; ownership rules for pointers/strings documented per-signature.

**Task 7.2 — Exposing TS to C.** `--emit-header` generates a `.h` for exported functions (Static Hermes `--exported-unit` model); values crossing out are C ABI types where sound, `jsrt_value` otherwise.

**Task 7.3 — Bindings for existing headers.** Start **manual** (hand-written `declare` files for the demo libs). A libclang-driven generator (functions + scalars + structs-by-pointer only) is built only after ≥3 manual bindings exist to define its spec.

**Check:** an example that statically links SQLite, queries it from TS, and is itself callable from a C `main()` — built and run in CI.

---

## 11. Phase 8 — The dynamic tier (gated; `js` mode only)

Gate: real users blocked on untyped npm dependencies or `eval`. Do not build speculatively.

- Embed **QuickJS-NG** in the runtime (scriptc `--dynamic` / Perry-eval model): `eval`, `new Function`, `Proxy`, and stubborn untyped modules run interpreted; a marshaling layer converts `jsrt_value` ↔ `JSValue` at the boundary (objects proxied by handle, not deep-copied).
- Makefile feature flag so pure-static builds are unchanged. **`ts` mode is untouched: `eval` stays `STA1101`, permanently.**

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
| 7 | Startup: snapshot initialized globals/builtins into the binary (V8 snapshot model) | 50–200 ms class wins for CLI tools | 4–6 wk |
| 8 | WasmGC backend — cross-browser baseline since Safari 18.2 (Dec 2024). Strategic optionality, not perf | new target, not a speedup | months |

Standing practices:
- **Split emitted C per module and compile in parallel** — generated megafiles make toolchains miserable. Also the v0 incremental-build answer: whole-program HIR, per-module C object caching keyed by content hash.
- **Compiler throughput:** reuse the `ts.Program`/checker across builds (watch mode later); if parsing/checking exceeds the §13 tripwire, move parsing to `oxc-parser` (napi) and keep the checker for types only; re-evaluate tsgo quarterly.
- **Perf-regression gate in CI** (Boa's lesson: conformance work silently taxes performance ~1–2%/release without a gate).
- **Publish the conformance % and benchmarks** — the field's trust currency.

---

## 13. Risks (with tripwires)

| Risk | Tripwire | Response |
|---|---|---|
| `typescript` API too slow / memory-heavy on large graphs | checking >30% of compile wall-time, or OOM on a 100k-line graph | Program reuse + caching first; then `oxc-parser` (napi) for parse, checker for types only; re-test tsgo's API each quarter in `plan-notes.md` |
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
2. Every claim of "done" cites the Check command output (test run, CI link, benchmark diff). No Check, no done.
3. New facts that contradict this plan (a dependency changed, a measurement disagrees) → append to `plan-notes.md` with evidence; update this plan in the same change. The plan is living, but it changes by edit, not by drift.
4. Decisions already made here are **settled** — re-open only with new measured evidence in `plan-notes.md`: TypeScript-strict implementation using the `typescript` API in-process; C11 runtime; emit C; no Rust anywhere; NaN-boxing + `JSRT_FRAME` rooting; UTF-16 strings; Ryū-exact number printing; `Unknown` as first-class HType; cycle-rejecting ESM-only modules; the feature × mode matrix (`docs/SUBSET.md`); `ts` as default mode; `eval` permanently rejected in `ts` mode; the locked tsconfig.
5. When measuring against Node/Bun/QuickJS/competitors: record version, flags, hardware, and the exact program. Never compare against a number you didn't produce.
6. Ambiguity rule: if a task still leaves you guessing, the gap is a bug in this plan — record it in `plan-notes.md` and resolve it by editing the plan, not by inventing an undocumented convention in code.
7. `tsconfig.json` and the Biome rules are load-bearing. Never weaken them to make code compile — fix the code, or follow rule 3.
8. Generated C is never hand-edited; fix the emitter. Vendored code (`runtime/vendor/`) is never modified except by documented, minimal patches recorded in `plan-notes.md`.

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
