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

> **Status: ⏳ STILL OPEN.** `NICHE.md` does not exist and there is no `phase-0-approved` tag. The initial repository snapshot is committed (`fa13a50`), but the human decision and tag are still required before Phase 2 work starts; Phase 1 was executed first on explicit owner instruction (`plan-notes.md`, Open items), and that exception does not extend further.

**Task 0.1 — Build-vs-join check.**

Steps:
1. Re-read the field summary in §0.1. The four funded-or-active players: Static Hermes, Perry, Porffor, scriptc. A new compiler is justified only by a niche they don't serve.
2. Write `NICHE.md` (repo root) naming the chosen niche, the competitor that almost serves it, and why they don't. Candidate niches from the research: **TS-native tooling binaries** (scriptc's lane — barely started, a Vercel Labs experiment); **WasmGC output** (Wasmnizer-ts's lane — "do not use in production", weakly held); **a two-mode compiler with a real JS story** (Stator's differentiator: nobody serves "strict TS binaries *and* your existing untyped JS in one tool"); or another concrete gap written down with evidence.
3. Confirm embedding isn't sufficient: if the real requirement is "users can script my app," **stop — embed a JS engine** (QuickJS-NG: hours of work, ~1.3 MB, <300 µs startup) or use WASM plugins (Zed/Lapce model). The compiler is only justified by: typed-code performance no interpreter reaches, tiny standalone binaries, or JIT-banned platforms.
4. Present `NICHE.md` to the human owner. **An agent must not self-approve this gate.**
5. On explicit human approval: commit, tag `phase-0-approved`.

**Check (machine-verifiable):** `NICHE.md` exists with the three required elements; `git describe --tags --exact-match HEAD` succeeds on its commit with tag `phase-0-approved`.

---

## 4. Phase 1 — Bootstrap and specifications ✅ COMPLETE (2026-08-29)

All four tasks are done and every Check passed (evidence on the Check lines below). Deviations from the written steps are logged in `plan-notes.md` (2026-08-29, entries 1–19); the executed step lists are removed here — what remains is the normative residue. **Two open follow-ups:** (a) the Phase-0 gate still needs the human approval/tag; (b) the Node pin is **26.7.0**, which satisfies "≥ 24" but may be Current rather than LTS — owner to confirm or drop to 24.x (notes #9); it is the differential ground truth, so settle it before Phase 2's golden tests exist.

~~**Task 1.0 — Bootstrap the TypeScript workspace.**~~ ✅ Done. Highlights: npm name `stator` is taken → package **`statorc`**, binary stays **`stator`**, both pinned by a unit test (notes #1); `typescript` pinned **6.0.3** — npm `latest` is already 7.0.2/tsgo, which §0.3 bans; re-evaluate 2026-11-29 (notes #2); lint/format is **Biome** (one dev dep replacing ESLint's ~130; the four load-bearing rules at `error`; `noUnnecessaryConditions` off for a documented inference gap; notes #19); runtime archives build to separate `build/` and `build-asan/` trees so a sanitized object can never reach a release link (notes #7); the package manager is **pnpm 11.20.0** (`packageManager` pin) and `cpd` 5.0.16 gates duplication at 1% inside `pnpm run ci` (notes #20). The **locked `tsconfig.json`** below remains normative (§15.7 — changes require a plan edit):
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

**Check — PASSED** (2026-08-29): `./ci.sh` green end to end (`pnpm install --frozen-lockfile && pnpm run ci` + the ASan runtime build); `node src/cli/main.ts --version` prints the version (pinned by a unit test); `make -C runtime` produces `runtime/build/libjsrt.a`. The literal "fresh clone" wording stays unverifiable until the initial commit exists — re-run it then.

~~**Task 1.1 — Write `docs/SUBSET.md`: the feature × mode matrix.**~~ ✅ Done — **`docs/SUBSET.md` is the sole authority for feature rows and their codes** (76 rows, grown from this plan's 26-row seed; the seed table is removed from here so it cannot drift — several of its placeholder codes were remapped when `DIAGNOSTICS.md` won the allocation collisions; notes #10/#11/#15/#17). The verdict vocabulary stays normative: **static** (compiled, unboxed hot path), **dynamic** (compiled via tagged values/shapes/ICs), **error(CODE)** (permanent, by design), **not-yet(CODE, phase)** (planned, diagnostic names the phase).

~~**Task 1.2 — Write `docs/MODES.md`.**~~ ✅ Done — includes the `explain --json` schema resolution (per-construct `constructs` array **plus** a derived file-level rollup, severity `error > not-yet > dynamic > static`; notes #12) and four contradictions found and fixed during reconciliation (1-indexed columns; per-construct codes; `Symbol` correctly a deferral, not permanent; `STA2001` reclassified as a *runtime* diagnostic; notes #13).

~~**Task 1.3 — Write `docs/DIAGNOSTICS.md`.**~~ ✅ Done — it is the **authoritative code allocator** (it wins every collision) and carries a "Retired codes" table: `STA1102` is retired (a not-yet code misfiled in the never range) and must never be reused (notes #10/#11). The range scheme stays as specified: `STA0xxx` CLI/config/toolchain; `STA10xx`/`STA11xx` "never" classes; `STA12xx` "not yet" (names the delivering phase); `STA2xxx` lowering/boundary (`STA2001` is a *runtime* class); `STA3xxx` module graph; `STA4xxx` internal errors (always a compiler bug).

~~**Task 1.4 — Decision tests + conventions.**~~ ✅ Done — **152 fixtures** (76 rows × 2 modes, identical slug sets) in `tests/subset/`; the runner also validates every `@code` against `DIAGNOSTICS.md` (retired codes fail — closes the hole where expected-fail fixtures are never otherwise executed; notes #14), and conditional "static if typed, else dynamic" rows follow the convention: the `ts` fixture takes the typed branch, the `js` fixture the untyped one (notes #16). The directive format lives in AGENTS.md → Testing rules.

**Check — PASSED** (2026-08-29): all three docs exist; 76 × 2 coverage holds by slug-set equality; `pnpm run test:subset` → `152 fixtures — 0 passed, 152 expected-fail, 0 failed`. All-expected-fail is the correct state until Phase 2 ships `explain`; **152 is the number to watch fall.**

---

## 5. Phase 2 — Walking skeleton, end to end (est. 2–3 weeks)

Ship the smallest full pipeline (`ts` mode only) before making any part good. The skeleton treats **all numbers as f64** — that is spec-correct JS semantics; the i32 fast path arrives with `NUMERIC.md` in Phase 3 as a pure optimization.

**Task 2.1 — Write `docs/VALUE.md` first.** All four §2 requirements (bit layout incl. `-0.0`, string struct + accessors, Ryū-exact number printing, rooting protocol). Mirror it in `runtime/include/jsrt_value.h`. No C emission before this merges.

**Task 2.2 — Micro-frontend.** Steps:
1. `src/frontend/program.ts`: build a `ts.Program` from the entry file with Stator-owned `compilerOptions` (strict family on; `noEmit`); surface tsc diagnostics as Stator diagnostics (type errors fail the build).
2. `src/frontend/gate.ts`: mode policy gate for the micro-subset — accept: literals (number/string/boolean), `let`/`const`, arithmetic `+ - * / %`, comparisons, `if`/`while`, `console.log`. Everything else: honest not-yet diagnostic with a span.
3. `src/frontend/types.ts`: `ts.Type → HType` for `number`/`string`/`boolean` only.

**Task 2.3 — Micro-HIR + verifier.** `src/hir/`: node defs for the micro-subset, every node carries an HType; `src/hir/verify.ts` checks type presence and operand agreement; runs after lowering in all builds for now.

**Task 2.4 — C emitter + driver.** Steps:
1. `src/codegen/`: emit one C file; `#line` directives mapping every statement to the `.ts` source; every function opens `JSRT_FRAME`/`JSRT_LOCAL` per `VALUE.md` — from the very first emitted line.
2. `src/cli/build.ts`: orchestrate emit → `clang -O2 -std=c11` → link `runtime/build/libjsrt.a` → executable at `-o` path. `--emit=c`/`--keep-c` retain the C file. Missing clang = `STA0xxx` with install hint.

**Task 2.5 — Runtime v0 (C11).** `jsrt_value` per `VALUE.md`; `JSString` + accessors; `jsrt_print` (console.log for number/string/boolean); shortest-round-trip number printing behind the `shortest_digits()` seam — Ryū (`runtime/vendor/ryu/`) drops into that one function when it can be vendored, see plan-notes 28; Boehm GC initialized where `bdw-gc` is present, with the plain-malloc fallback building and reporting itself when it is not (record install line for macOS/Linux in `TOOLCHAIN.md`); panic handler printing a stack-frame count.

**Task 2.6 — Golden-test harness.** `tests/golden/run.ts`: each `tests/golden/ts/*.ts` is compiled AND run under the pinned Node (`node file.ts` — Node strips types natively); stdout must match **byte-for-byte**. This differential check against Node is the project's ground truth from day 1.

**Task 2.7 — CI hardening.** Add golden tests to `pnpm run ci`; add the ASan/UBSan job (golden tests against `make -C runtime asan` + clang `-fsanitize=address,undefined` on generated C). Record baseline binary size and compile wall-time into `tests/bench/baseline.json`.

**Check:** `console.log(1 + 2 * 3)` prints `7` and an iterative fibonacci with `let`/`while` compiles, runs, and matches Node byte-for-byte in CI, ASan/UBSan clean; `stator explain` reports `static` for both programs; baseline metrics recorded.

**Status: ✅ COMPLETE (2026-08-29).** Check evidence:
- `pnpm run test:golden` → `golden: 6 fixtures — 6 passed, 0 failed`, covering `arithmetic.ts` (prints `7`), `fibonacci.ts` (`let`/`while`, prints `6765`), `numbers.ts` (the formatting boundaries: 1e20, 1e21, 1e-7, `0.1 + 0.2`, ±Infinity, NaN), `control-flow.ts`, `strings.ts` (UTF-8 output), and one `js`-mode fixture. Each is compared byte-for-byte against `node <file>` on the pinned Node.
- `pnpm run test:asan` → the same 6 fixtures pass with the runtime and generated C built `-fsanitize=address,undefined`, plus `runtime: print corpus matches Node (ASan/UBSan)`.
- `pnpm run test:runtime` → the 45-value number/string corpus in `runtime/tests/` matches `console.log` byte-for-byte.
- `stator explain --json` reports `{"verdict":"static"}` for both Check programs.
- `tests/bench/baseline.json` records compile wall-time and binary size per fixture, with host, Node, and clang versions.

Ten defects were found and fixed while making this Check pass; the ones with a lasting rule attached are plan-notes 28–34. The load-bearing one: **the gate's accept set must equal the HIR's vocabulary exactly** — a construct accepted above but unrepresentable below is not a missing feature, it is an internal error waiting to happen.

---

## 6. Phase 3 — Typed HIR and the lowering ladder (est. months 1–3)

**Task 3.1 — HIR design doc (`docs/HIR.md`). ✅ COMPLETE.** **Task 3.2 — `docs/NUMERIC.md`. ✅ COMPLETE**, all 34 of its §10 claims pinned against the pinned Node by `tests/unit/numeric-spec.test.ts` (one claim in the first draft was wrong: `1e21 | 0` is negative).

**Task 3.1 — HIR design doc (`docs/HIR.md`).** Typed, structured control flow (not SSA — structured HIR keeps C emission trivial); every node carries an HType; the HType lattice includes **`Unknown` as a first-class type**: source `any` (js mode)/`unknown`/unions lower to it immediately, codegen emits it as tagged `jsrt_value`, and **every pass (const-fold, DCE, inline) must preserve `Unknown` and may never elide a check on one** — boundary checking is a property of the type system, not a post-hoc pass optimizers can undo. The ts.Type→HType mapping section with ≥10 worked examples (§2). The **HIR verifier** runs after every transform in debug builds.

**Task 3.2 — `docs/NUMERIC.md` — numeric semantics contract**, written before general arithmetic lowering:
- internal i32 fast path; i32 overflow promotes to f64 (JS numbers are f64 — i32 is our invisible optimization);
- bitwise ops (`& | ^ << >> >>>`) apply spec `ToInt32`/`ToUint32` to operands *whatever representation they currently have*; `>>>` produces uint32 (may need f64);
- `-0`, `NaN` propagation, `Object.is` SameValue semantics;
- `==` loose-equality table for primitives; ToPrimitive (valueOf/toString order) specified for the dynamic path;
- decision tests: `(0xFFFFFFFF >>> 0) === 4294967295`, `Object.is(-0, 0) === false`, `(1/3 | 0) === 0`, `NaN !== NaN`.

**Task 3.3 — The lowering ladder.** Lower in this order; each rung ~1–3 weeks, each with golden + decision tests before moving on (arithmetic/strings can run in parallel with control-flow/functions if two agents work disjoint files):
1. Arithmetic per `NUMERIC.md` (introduces i32/f64 split into HIR + runtime).
   - **1a — semantics on the f64-only path: ✅ COMPLETE (2026-08-29).** Unary `- + ! ~`; bitwise
     `& | ^ << >> >>>` with spec `ToInt32`/`ToUint32`; loose equality `==`/`!=`; short-circuiting
     `&&`, `||`, `??`; `null` and `undefined` literals; ToBoolean on conditions. `pnpm run ci`
     green: 70 unit tests, `golden: 10 fixtures — 10 passed` under both the release and the
     ASan/UBSan runtime. Four new golden fixtures (`bitwise`, `unary`, `logical`, `equality`)
     match Node byte-for-byte. Defects found and fixed: plan-notes 35–38.
   - **1b — the i32 refinement: DEFERRED until a runtime-speed measurement exists (Task 6.3).**
     `NUMERIC.md` §11's stated precondition — §10's tests passing on the f64 path — is met. Its
     unstated one is not: §11 also says the refinement "can only *break* things: there is no
     correctness argument for it, only a performance one", and nothing in the repo can measure that
     performance. `tests/bench/baseline.json` records compile wall-time and binary size only, by
     Task 2.7's design; the compute set that would show an i32 win is Task 6.3. Landing 1b now would
     mean claiming a task done on a Check that cannot be run (plan-notes 56). The ladder therefore
     continues at rung 6, and 1b is pulled forward the moment someone wants to spend the
     measurement effort — nothing depends on it, and no `i32` is half-built (`VALUE.md` §5 still
     lists the tag as layout only).
2. **Strings + template literals: ✅ COMPLETE (2026-08-29).** UTF-16 via `VALUE.md` accessors;
   `jsrt_op_add` (the `+` that concatenates when *either* operand is a string), content equality,
   code-unit ordering, template literals as their own HIR node, and `.length`. `pnpm run ci` green:
   71 unit tests, `golden: 12 fixtures — 12 passed` under both the release and the ASan/UBSan
   runtime, `subset: 152 fixtures — 17 passed, 135 expected-fail, 0 failed`. Two golden fixtures
   added (`string-ops`, `template`). Defects found and fixed: plan-notes 39–42. Rung 1a's deliberate
   gap — `+` on strings — is now closed.
3. **Control flow completion: ✅ COMPLETE (2026-08-29).** C-style `for` (all three header slots
   optional), `do`/`while`, `switch`, `break`/`continue`, and labels — all jumps compiled to
   `goto`. Compound assignment (`+= -= *= /= %=`) and `++`/`--` landed with them: rung 1 deferred
   both, and every one of this rung's decision tests needs them (plan-notes 43). `pnpm run ci`
   green: 80 unit tests, `golden: 12 fixtures — 12 passed` under both the release and the
   ASan/UBSan runtime, `subset: 152 fixtures — 26 passed, 126 expected-fail, 0 failed` (up from
   17). One golden fixture added (`control-flow`). Defects found and fixed: plan-notes 43–46.
   - `for-of` moved to rung 5: it iterates an array, so it cannot land before arrays exist. It was
     listed here because it is spelled like a loop, which is the wrong axis — see plan-notes 44.
4. Functions + closures — split into **4a** (calls) and **4b** (captures); recursion needs no
   environment, so it belongs with the former (plan-notes 49).
   - **4a ✅ COMPLETE (2026-08-29).** Function declarations, function expressions, arrow functions,
     parameters, `return`, calls, recursion and mutual recursion. Module-level bindings moved out of
     `main`'s frame into a file-static `JSRT_GLOBALS(n)` pushed once and never popped, because a
     function body may legally read them; that is what makes a self-call resolve. `pnpm run ci`
     green: 116 unit tests, `golden: 14 fixtures — 14 passed` under both the release and the
     ASan/UBSan runtime, `subset: 152 fixtures — 35 passed, 117 expected-fail, 0 failed` (up from
     26). Two golden fixtures added (`ts/functions`, `js/functions`). Defects found and fixed:
     plan-notes 47–48 — Stator was enforcing `noUnusedLocals`/`noUnusedParameters` on *user* source
     and `noImplicitAny` in js mode, and no expected-fail marker had ever been checked for
     staleness. The rung's two standing ceilings are recorded in plan-notes 49.
   - **4b ✅ COMPLETE (2026-08-29).** Captured function-locals: environment structs, capture
     analysis. A closure becomes heap-allocated with an environment pointer; the gate stops
     rejecting cross-function references. `pnpm run ci` green: 125 unit tests,
     `golden: 16 fixtures — 16 passed` under both the release and the ASan/UBSan runtime,
     `subset: 156 fixtures — 39 passed, 117 expected-fail, 0 failed` (up from 35), `12 clones ·
     0.6% duplication`. One golden fixture added (`ts/closures`), four decision tests
     (`closure_capture` and `closure_capture_in_loop`, both modes), one unit-test file
     (`tests/unit/captures.test.ts`). Defects found and fixed: plan-notes 51–52 — a nested
     function's own name was counted as a capture of itself (costing every such function 4a's
     static closure), and a captured loop variable compiled to the last iteration's value, which is
     now `STA1214` rather than a wrong answer. **The rung's standing ceiling:** capturing a binding
     declared inside a loop needs per-iteration environments, deferred to the loop-scope work Phase
     5 step 3 also depends on (plan-notes 52).
     **Representation settled in plan-notes 50** — a heap `JSRTEnv` traced
     `closure → env → slots` (not bare cells, which only a conservative collector can find), the
     env rooted by a new `JSRTEnv *env` field on `JSRTFrame` (it is not reachable from any closure
     before the first one is created, and the tag space is full — see the correction in that
     entry), and a parent chain rather than
     flat capture (flat either breaks shared mutation or reintroduces cells). Non-capturing
     functions keep 4a's static closure with `env = NULL`. `JSRTClosure.fn` gains an env parameter,
     so every generated function's signature changes — that is a `docs/VALUE.md` change too.
5. **Arrays: ✅ COMPLETE (2026-08-29).** Dense, bounds-checked storage (`JSRTArray`: `length`,
   `capacity`, and a separately-allocated element buffer, so the header address stays stable across
   growth); array literals, `.length`, index read and index write, and `for-of` over an array —
   compiled to a counted loop that re-reads the length each step, and labellable like any other
   loop. `console.log` on an array reproduces Node's `util.inspect` byte-for-byte, grouping and
   80-column break and depth cap included (`docs/VALUE.md` §4.4). `pnpm run ci` green: 136 unit
   tests, `golden: 17 fixtures — 17 passed` under both the release and the ASan/UBSan runtime,
   `subset: 160 fixtures — 50 passed, 110 expected-fail, 0 failed` (up from 39), `runtime: print
   corpus matches Node` in both builds, `16 clones · 0.6% duplication`. One golden fixture added
   (`ts/arrays`), ten decision tests (five array/for-of pairs), one unit-test file
   (`tests/unit/arrays.test.ts`). Defects found and fixed: plan-notes 53–55 — a binding's HType came
   from its initializer rather than its declaration, which made the legal `let x: string | number =
   1; x = 'a'` an internal compiler error; a write that would leave a hole silently filled it with
   `undefined` and printed a different program's output; and the unit-test helper had been building
   every program with `lib: ['es2024']`, which is not a lib FILE name and so resolved to no standard
   library at all (in which `number[]` is an error type).
   **The rung's standing ceilings, both with the plan's own answer:**
   - **Sparse arrays are `STA2002`, raised at runtime.** A write more than one past the end refuses
     rather than filling the gap; in-range writes and `a[a.length] = v` are unaffected. Lifts with
     the object model (plan-notes 55).
   - **The typed read of `a[i]` landed with Task 3.5.** `noUncheckedIndexedAccess` (Task 1.0) types
     an indexed read as `T | undefined`, which lands in the HIR as `Unknown`; narrowing one now
     inserts a check, so `const v = a[i]; if (v !== undefined) { sum = sum + v; }` compiles and the
     addition is on a value proved to be a number. The bare `sum += a[i]` still does not, and that
     is the CHECKER refusing it, not the gate — `T | undefined` is not addable, and no check the
     compiler inserts changes what TypeScript will accept.
     Elision of the bounds check remains open and belongs to the optimization passes: 3.5 gives it
     something to elide, it is not itself the eliding. The flag stays on: an index is a boundary,
     and golden rule 4 applies to it (plan-notes 53).
6. Classes → fixed slot offsets; getter/setter classes take the dynamic path per `SUBSET.md`.
   Split into **6a** (a class whose layout is fixed at its declaration) and **6b** (everything that
   changes what a layout is), on the line drawn in plan-notes 59.
   - **6a ✅ COMPLETE (2026-08-29).** Classes with fields, one constructor, instance methods and
     field initializers; `new`, `this`, field read and write in every assignment form, and method
     calls. An instance is one allocation — a pointer to a file-scope `static const JSRTClass`
     descriptor followed by its slots — with declaration order as slot order; a field read is an
     offset load. A method occupies no slot: one function is shared by every instance and the call
     resolves at compile time, with the receiver passed as argument zero. `console.log` on an
     instance reproduces Node's `util.inspect` byte-for-byte, including the fact that the class name
     counts toward the 80-column budget and that objects never group (`docs/VALUE.md` §4.5).
     `pnpm run ci` green: 147 unit tests, `golden: 18 fixtures — 18 passed` under both the release
     and the ASan/UBSan runtime, `subset: 160 fixtures — 52 passed, 108 expected-fail, 0 failed`
     (up from 50), `runtime: print corpus matches Node` in both builds, `22 clones · 0.8%
     duplication`. One golden fixture added (`ts/classes`), one runtime corpus (`print_objects`),
     one unit-test file (`tests/unit/classes.test.ts`); the `class_fixed_shape` decision tests flip
     to passing in **both** modes. Defects found and fixed: plan-notes 57. Design decisions
     recorded: plan-notes 58 (`this` is a parameter, not a node kind) and 59 (the 6a/6b line).
   - **6b — ToPrimitive ✅ done (2026-08-29).** ToPrimitive was listed here
     as a feature and was not one: `jsrt_loose_equals`, `jsrt_to_number`, `jsrt_op_add`, and
     `jsrt_compare` had all shipped object-blind in rung 5, so `a == a` answered **false** for every
     array and class instance while `a === a` answered true. One `jsrt_to_primitive`, run first in
     each of the four, closes all 12 mismatches a 22-expression probe found against Node
     (plan-notes 60); it takes no `hint` parameter, because nothing in the subset can observe one
     (`docs/NUMERIC.md` §7 says when that changes). Two golden fixtures carry it: the object rows of
     `ts/equality` and a new `js/to-primitive` for the conversions ts mode's checker rejects before
     the compiler sees them. Second defect fixed in passing: `STA4011`/`STA4012` rejected an
     `unknown` arithmetic operand, so `id(a) - 1` in js mode — source the gate accepts — reached an
     internal error.
   - **6b — inheritance and `super(...)` ✅ done (2026-08-29).** `extends`, `super(...)`, prefix
     layout, assignability, `instanceof` up the chain, and synthesized derived constructors. A
     subclass's slots START with its base's, in the base's own slot order, which is the only thing
     making `hTypeAssignable` sound: the first N slots of a `Dog` *are* an `Animal`, so every
     existing node — `FieldAccess`, `MethodCall`, `console.log`'s printer — works unchanged on a
     base-typed reference. The slot list is rebuilt root-first from the chain, because the checker
     lists a subclass's OWN properties first (plan-notes 62, which also records the js-mode bug a
     sort-based fix caused and a golden fixture caught). `JSRTClass` grew one `parent` pointer and
     `jsrt_instanceof` grew the walk; no generated C at a call site changed. `MethodCall.className`
     became the class that DECLARES the method, so an inherited method is a direct call to the one
     function that exists. Field initializers now run AFTER `super(...)`, since one may read a field
     the base wrote. A derived class that writes no constructor gets JavaScript's implicit
     `constructor(...args) { super(...args) }`.
     **Method overriding and `super.method()` are deferred with the vtable, deliberately**: static
     dispatch is sound exactly while no method is overridden, so redeclaring an inherited member is
     refused at the gate with that reason in both modes rather than silently dispatching to the
     base's body (plan-notes 63, which also records three load-bearing-invariant violations found on
     the way). `pnpm run ci` green: 158 unit tests, `golden: 22 fixtures — 22 passed` under both the
     release and the ASan/UBSan runtime, `subset: 164 fixtures — 60 passed, 104 expected-fail, 0
     failed`, `runtime: print corpus matches Node` in both builds, `22 clones · 0.8% duplication`.
     Two golden fixtures added (`ts/inheritance`, `js/inheritance`); `class_inheritance` flips to
     passing in both modes and a new `method_override` pair pins the deferral.
   - **6b — static members ✅ done (2026-08-29).** A static belongs to the class object and there
     is no class object here, so a static is ONE binding for the whole program under a name no
     source can spell (`C.count`; the dot does what the receiver parameter's leading space does).
     That reduction is the design: a read is an `Identifier`, a write is an `Assignment`, `C.m()` is
     a `CallExpr`, and `C.count += 1` reuses the identifier compound path unchanged — statics needed
     **no HIR node, no verifier case and no emitter case**, only a `statics` list on
     `ClassDeclaration` that the enclosing scope walks. The name carries the DECLARING class,
     because statics are inherited and `Sub.count` must be the same binding as `Base.count`; names
     hoist before values are lowered, so one static method may call another written below it
     (plan-notes 65).
     Two pre-existing defects surfaced and were fixed. `hTypeAssignable` refused an Unknown VALUE
     into a typed binding, making six lines of ordinary js-mode source (`let total = 0; total =
     add(total, 3)` with an untyped `add`) an internal error; Unknown is now assignable in both
     directions, the same exemption arithmetic operands already got. And `this`/`super` were gated
     by **dead code** — both are `ts.SyntaxKind` TOKENS, so the walker's token short-circuit
     swallowed their cases, and `console.log(this)` reached `STA4061` instead of a `not-yet`
     (plan-notes 64). `pnpm run ci` green: 164 unit tests, `golden: 24 fixtures — 24 passed` under
     both the release and the ASan/UBSan runtime, `subset: 166 fixtures — 64 passed, 102
     expected-fail, 0 failed`, `runtime: print corpus matches Node` in both builds, `22 clones ·
     0.7% duplication`. Two golden fixtures added (`ts/statics`, `js/statics`);
     `static_class_members` flips to passing in both modes and a new `static_block` pair pins the
     deferral.
     `#private` members then landed with **no compiler surface of their own**: `#count` is a slot,
     `#step()` a member function, `static #next` a static binding, and the name simply keeps its
     `#`. Privacy is a checker fact — every access from outside the class body is already an error
     before the gate runs — so the whole feature below the frontend is one rule in the runtime
     printer: `util.inspect` omits `#private` fields, so a descriptor field name starting with `#`
     is skipped, and a class whose fields are all private prints `C {}`. Two deferrals are forced by
     the layout, not by privacy: a subclass re-declaring an ancestor's `#private` name is two slots
     sharing a spelling that a name-keyed list would merge, and `#brand in o` asks whether a slot
     exists rather than reading it. A third defect surfaced: the runtime Makefile listed no header
     prerequisites, so editing `jsrt_value.h` rebuilt nothing and `make -C runtime test` had been
     linking corpus binaries against a struct that no longer existed; fixed with generated depfiles
     (plan-notes 66). `pnpm run ci` green: 168 unit tests, `golden: 26 fixtures — 26 passed` under
     both the release and the ASan/UBSan runtime, `subset: 168 fixtures — 68 passed, 100
     expected-fail, 0 failed`, `runtime: print corpus matches Node` in both builds, `23 clones ·
     0.8% duplication`. Two golden fixtures added (`ts/private`, `js/private`); `private_fields`
     flips to passing in both modes and a new `private_shadowed` pair pins the deferral.
     Method overriding then landed with a **method table in the class descriptor**: `method_count`
     entries of file-scope `JSRTClosure` pointers, in the same prefix order the fields have, so the
     slot comes from the receiver's static type and the entry from its dynamic one. Dispatch is
     decided per METHOD, not per call site — the lowering asks the whole file whether any chain
     containing the receiver's class declares that name twice — so a method nothing overrides keeps
     rung 6a's direct call and a program that overrides nothing pays nothing. `super.m()` is a call
     on the same receiver with the override skipped, and is direct even where the same method is
     virtual everywhere else; a virtual call there would find the override again and recur. Two
     deferrals follow from the table being a constant: overriding inside a function (a method there
     may capture) and re-declaring a FIELD (one slot, two initializers). A mode-policy bug fell out
     and was fixed: `noImplicitOverride` demanded a JSDoc `@override` tag in js mode, rejecting
     ordinary JavaScript, and is now `mode === 'ts'` like `noImplicitAny` (plan-notes 67). One
     contradiction is recorded and NOT fixed: js mode still rejects an override that narrows an
     inferred return type, pinned as an `@expected-fail` decision test (plan-notes 68).
     `pnpm run ci` green: 175 unit tests, `golden: 28 fixtures — 28 passed` under both the release
     and the ASan/UBSan runtime, `subset: 173 fixtures — 72 passed, 101 expected-fail, 0 failed`,
     `runtime: print corpus matches Node` in both builds, `23 clones · 0.8% duplication`. Two golden
     fixtures added (`ts/override`, `js/override`); `method_override` flips to passing in both
     modes and new `override_nested` and `field_redeclared` pairs pin the deferrals.
     Getters and setters then landed — and NOT via the dynamic path the plan predicted. An accessor
     is a pair of member functions under a name no source can spell (`get x`, `set x`, where the
     space does what the dot does for a static), so `o.x` is a call and `o.x = v` is a call, the
     property occupies no slot, and the class keeps the fixed-slot layout of its actual fields. The
     whole feature is a mangled name, one branch in `classTypeToHType` and two in the lowering: no
     HIR node, no verifier case, no emitter case, no runtime change, and `util.inspect` omits the
     property for free because the printer prints slots. The `dynamic` verdict this plan promised
     for such a class is now `static`, and `docs/SUBSET.md` is corrected (plan-notes 69). Deferred
     with reasons: a compound assignment to an accessor, a static accessor, a `#private` or computed
     accessor name, and overriding an inherited accessor. `pnpm run ci` green: 179 unit tests,
     `golden: 30 fixtures — 30 passed` under both the release and the ASan/UBSan runtime,
     `subset: 177 fixtures — 78 passed, 99 expected-fail, 0 failed`, `runtime: print corpus matches
     Node` in both builds, `25 clones · 0.8% duplication`. Two golden fixtures added
     (`ts/accessors`, `js/accessors`); `class_with_getters_setters` flips to passing in both modes
     and new `accessor_compound` and `static_accessor` pairs pin the deferrals.
     Object literals closed the rung, and the premise this plan gave for deferring them — "a
     literal has no class declaration to be a layout OF" — was true of the DECLARATION and false of
     the layout. The checker already computes the anonymous object type, with its properties in
     written order, which is exactly what the class path consumes; the missing piece was a NAME. A
     shape is named structurally (`{x: number, y: string}`, whose leading brace is unspellable the
     way the receiver's leading space and a static's dot are), so two literals with the same fields
     are one HType, share one emitted descriptor, and are assignable to each other — while a
     different key ORDER is a different shape, because order is layout. The descriptor's name is
     empty and the printer reads an empty name as "no constructor name", which is the single
     runtime change the feature needed and the reason `{ x: 1 }` prints bare where `Point { x: 1 }`
     does not. One HIR node (`ObjectLiteral`: entries in written order, no keys below the gate), one
     verifier case (STA4052 — the entries ARE the slots, so an order that disagrees with the shape
     would emit a silently wrong object), one emitter sequence expression (plan-notes 70). Deferred
     with reasons: a shorthand, spread, method or accessor member and a non-identifier key (Phase 3
     — statically knowable, nothing to lower to yet); a literal whose type is not a layout, meaning
     an optional property or an index signature (Phase 4 — that is the shape table in Task 4.1, and
     the gate's message says so rather than naming one phase for both kinds of refusal).
     `pnpm run ci` green: 187 unit tests, `golden: 32 fixtures — 32 passed` under both the release
     and the ASan/UBSan runtime, `subset: 181 fixtures — 84 passed, 97 expected-fail, 0 failed`,
     `runtime: print corpus matches Node` in both builds, `25 clones · 0.8% duplication`. Two golden
     fixtures added (`ts/objects`, `js/objects`); `object_literal_static_keys` flips to passing in
     both modes and new `object_literal_method` and `object_literal_spread` pairs pin the deferrals.
     One side finding, recorded because it changes a shared file: the two added interfaces pushed
     `nodes.ts` past jscpd's 50-token floor, and jscpd bills a match by the LINE span between its
     first and last token, so 50 tokens in a comment-heavy declaration file were charged as 623
     duplicated lines. `nodes.ts` holds types and nothing else, and a discriminated union's `kind`
     field cannot be factored out without deleting what makes the IR safe, so the declarations are
     wrapped in `jscpd:ignore` markers that say why in the file. The threshold stays 1% and the
     config is untouched (plan-notes 71).
   - **6b ✅ COMPLETE (2026-08-29).** Everything plan-notes 59 assigned to the rung has landed:
     ToPrimitive, inheritance and `super(...)`, statics, `#private`, method overriding and
     `super.m()`, accessors, and object literals with static keys. Two claims this plan made about
     the rung turned out to be wrong and are corrected above rather than left standing: a class with
     accessors does NOT take the dynamic path (an accessor is a method under an unspellable name,
     plan-notes 69), and a literal's lack of a class declaration does not deny it a layout (the
     shape comes from the type, plan-notes 70). Deferrals are individually justified where they
     appear, and each is pinned by an `@expected-fail` decision test in both modes; the only one
     that is a plan contradiction rather than a schedule is plan-notes 68 (js mode rejects an
     override narrowing an inferred return type).
7. `Map`/`Set`: **one** open-addressed hash table keyed by SameValueZero, not the two paths this
   line used to ask for. A NaN-boxed primitive key already IS its unboxed bits and an object key
   already IS its pointer, so the "specialized primitive" and "identity-hash" tables would have been
   the same code twice; the only difference is four lines inside one `hash_key` (plan-notes 72).
   - **7 ✅ COMPLETE (2026-08-29).** `new Map<K, V>()` / `new Set<T>()`, `get`, `set`, `has`,
     `delete`, `clear`, `add`, `size`, and `console.log` of either matching Node byte-for-byte in
     both the release and ASan/UBSan builds. Entries are dense and in insertion order, so print
     order survives deletion and the growth compaction. A Set is the same struct with the value half
     unused, told apart by a second `JSRTClass` descriptor — the tag field is full (`docs/VALUE.md`
     §1.1), so a builtin is an `Object`-tagged pointer distinguished by its descriptor, exactly as
     an object literal is. Two frontend facts this plan did not predict are recorded in SUBSET.md:
     the type arguments must be on the CONSTRUCTION (`const m: Map<string, number> = new Map()`
     types the call `Map<any, any>`), and `.get` is dynamic everywhere because the lib types it
     `V | undefined` and the HType model has no union. Deferred: constructing from an iterable,
     iteration through an ITERATOR (`for-of`, `keys`, `values`, `entries`), and `WeakMap`/
     `WeakSet`, which need the collector to know what weakness is. `forEach` is not among them
     and once was by mistake: it takes a callback, not an iterator (Task 4.2 addendum below).

**Task 3.4 — Monomorphization.** ✅ **Done.** Generic function DECLARATIONS are instantiated per concrete type tuple, shared by HType identity, and capped at depth 16 (`STA2003`, a user error — the program genuinely has no fixed point).

  Specialization happens at the LOWERING, not in a pass: the generic's AST is lowered once per tuple with the substitution in scope (carried in the binding map already threaded everywhere, under the unspellable key `<T>`), so a type parameter is never built into the HIR at all — `hasTypeParam` in the verifier (`STA4054`) checks an invariant of construction rather than the output of a walk. See plan-notes.md entry 73 for why this beats an HIR clone pass.

  The substitution is recovered through the public API by unifying the DECLARED signature's HTypes (which mention `T`) against the RESOLVED one's (which do not) — exact, not heuristic, because one is the other instantiated. Unifying on HType rather than `ts.Type` is what makes `box(1)` and `box(2)` share one specialization: their literal types collapse to `number`.

  Deferred (`STA1214`): a generic used as a VALUE, generic arrows/function expressions, constrained or defaulted type parameters, explicit type arguments, and generic classes. The boxed-`Unknown` fallback instantiation for cold generics is not built — §13's bloat budget has not been tripped, and building it before it is would be a second code path with no measurement behind it.

  `pnpm run ci` green: `Checked 45 files … No fixes applied`, `28 clones · 0.9% duplication`, 209 unit tests (14 of them `tests/unit/generics.test.ts`), `runtime: print corpus matches Node`, `subset: 181 fixtures — 94 passed, 87 expected-fail, 0 failed`, `golden: 36 fixtures — 36 passed, 0 failed` under both the release and the ASan/UBSan runtime.

**Task 3.5 — Boundary-check insertion.** ✅ **Done.** A narrowed read of an `Unknown` and an `as` cast off one both lower to a `BoundaryCheck`, which emits `jsrt_check_number/string/boolean` — the value back on success, `STA2001` with a `file:line:col` on failure. `typeof` landed with it, as its own HIR node.

  Not a pass, for the same reason Task 3.4 is not: the insertion point is where a `ts.Type` becomes an HType, which only the lowering has. A pass would have to rediscover the narrowing from an HIR that had already thrown it away.

  Three deliberate scopings, all recorded in plan-notes.md entry 74. The check is per USE, not per binding — nothing proves the value did not change between two reads. A narrowing to a type no TAG settles in constant time (an object, an array, a signature) leaves the value `Unknown` on the dynamic path rather than being refused: refusing buys no soundness, since nothing downstream was going to trust the type, and would break `m.get(k) ?? d` and every other narrowing that compiles today. And **union types came free**: the HType model has no union node, so `string | number` IS `Unknown`, and narrowing one is the machinery `unknown` already needed. A union whose constituents all map to one HType is widened to it (`"a" | "b"` → `string`), which is what makes `typeof` usable at all — TypeScript types it as a union of eight string literals.

  Deferred: `JSON.parse` and FFI returns, which need the builtin (§7 Task 4.2) and Phase 6 rather than new check machinery; `.ts`↔`.js` graph boundaries, which need Phase 5's module graph; and discriminated unions keyed on a TAG, which need a union the model can see the constituents of.

  `pnpm run ci` green: `Checked 47 files … No fixes applied`, `28 clones · 0.9% duplication`, 220 unit tests (11 of them `tests/unit/narrowing.test.ts`), `runtime: print corpus matches Node` (now including `print_typeof`), `subset: 181 fixtures — 100 passed, 81 expected-fail, 0 failed` (`typeof`, `unknown` and union fixtures flipped off `@expected-fail` in both modes), `golden: 38 fixtures — 38 passed, 0 failed` under both the release and the ASan/UBSan runtime.

**Task 3.6–3.9 — Optimization passes v0.** ✅ **Done.** Const-fold, DCE/tree-shake and inlining run as `optimize()` from `src/passes/index.ts`, over a shared bottom-up, identity-preserving rewriter (`src/passes/rewrite.ts`) with exhaustive switches over every HIR node kind.

  They run BEFORE the verifier, not after the lowering: what reaches the emitter is the optimized module, so that is what has to be checked. Verifying the lowering's output instead would check a tree nothing emits (plan-notes.md entry 75).

  `Unknown` preservation is a property of each pass's admission rule rather than a check bolted on. Const-fold folds only when every operand is a LITERAL NODE — which is simultaneously why no fold can elide a boundary check (a literal is never `Unknown`) and why no fold can delete a side effect (a literal has none). DCE reasons only about control flow, never about values. Inlining requires the argument's HType to equal the parameter's, which is what stops a `js`-mode call from having its `Unknown` parameter replaced by a typed subtree.

  The evaluator for folding is JavaScript's own — the compiler runs on the pinned Node the golden tests diff against, so a folded `${1 / 3}` and an unfolded one produce the same bytes, and `-0`, NaN and `1 << 31` need no special case.

  Inlining covers a body that is exactly one `return <expr>`, bounded by four refusals (one statement; the body names nothing but its parameters; every argument is a literal or identifier; types agree exactly). Condition two closes the shadowing hazard the HIR's name-only identifier resolution creates, and makes recursion impossible by construction — nothing tests for it. The pipeline runs once rather than to a fixpoint; both scopings and the ordering argument are in plan-notes.md entry 75.

  Deferred: a general inliner (needs a block-expression or the statement machinery for multi-return bodies), iterating to a fixpoint, treating an `if` whose branches both return as a terminator, and shaking classes — `new C()` names its class by string, so the reference walk cannot see it. Builtin tree-shaking is Task 3.12.

  `pnpm run ci` green: `Checked 52 files … No fixes applied`, `28 clones · 0.8% duplication`, 245 unit tests (25 of them `tests/unit/passes.test.ts`), `runtime: print corpus matches Node`, `subset: 181 fixtures — 100 passed, 81 expected-fail, 0 failed`, `golden: 40 fixtures — 40 passed, 0 failed` under both the release and the ASan/UBSan runtime.

**Task 3.10 — Exception unwinding.** `try/catch/finally` lowering emits per-scope cleanup blocks; every `goto landing_pad_N` routes through the scope's cleanup (shadow-frame pops, `finally` bodies); decision tests exercise throw-inside-loop-inside-try with ASan on.

  ✅ **Done (2026-08-30).** Return-value + landing-pad style exactly as §2 prescribes: the runtime contributes one thread-local pending cell (`jsrt_throw`/`jsrt_pending`/`jsrt_take_exception`, overwrite-on-throw required so a finally's throw replaces the in-flight completion) plus `jsrt_uncaught` (stderr + exit 1, matching Node observably); everything else is generated C. Every throwing operation — `jsrt_call` in all its spellings — is emitted as its own statement followed by `if (jsrt_pending()) goto <pad>;`, which forced the emitter's comma-expression builders to learn to flush to statements when an operand carries a call (evaluation order stays JavaScript's: already-evaluated operands are in rooted slots before a later operand's call runs). Loop conditions and short-circuit right operands capture their prelude and replay it at the re-evaluation point. A try-with-finally lowers to an `int` completion code (0 normal, 1 rethrow the stashed — rooted — exception, 2+ one per distinct `return`/`break`/`continue` out of the protected code) dispatched after the finally body; the dispatch re-performs the jump in the popped context, so a jump crossing two finallys chains through both, and a finally's own throw/jump abandons the code undispatched — which IS the replacement rule. Units that can throw get a `_jsrt_unwind` pad that pops the frame (main's calls `jsrt_uncaught`). New: HIR `ThrowStatement`/`TryStatement` (catch binding Unknown always; `STA4057` for unbuildable shapes), gate accepts try/throw/catch (destructured catch binding stays not-yet STA1214), docs/VALUE.md §4.9, docs/HIR.md §1.3. Check: `pnpm run ci` green — `Checked 52 files … No fixes applied`, `31 clones · 0.9% duplication`, `tests 255 / pass 255 / fail 0`, `subset: 181 fixtures — 102 passed, 79 expected-fail, 0 failed` (both `subset_try_catch_finally_throw_*` flipped from expected-fail), `golden: 42 fixtures — 42 passed, 0 failed` under both the release and the ASan/UBSan runtime; `tests/golden/{ts,js}/exceptions.*` exercise throw-inside-loop-inside-try, return/break/continue through finally, rethrow, nested try and finally-replaces-throw, byte-for-byte against Node.

**Task 3.11 — Modules.** ESM only, whole-program v0. Build the import graph from the `ts.Program`; **cycles are `STA3001` with source locations** (never silently pick an order); module-init code in topological order. Decision tests: cycle rejected; `a→b→c` initializes c, b, a.

  ✅ **Done (2026-08-30).** Whole-program v0 as one merged Module HIR: `src/frontend/graph.ts` walks value imports (type-only edges skipped) off the `ts.Program`, DFS back edges are STA3001 with the cycle spelled (`a.ts → b.ts → a.ts`), and the postorder is the init order — dependencies first, entry last — which `lowerProgram` lowers into a single statement list sharing one binding namespace. An import binds nothing (the name resolves to the exporting file's own top-level binding), so the gate refuses every aliasing shape as not-yet STA1214: renamed specifiers, default imports, namespace imports, re-exports, non-literal default exports; cross-file top-level name collisions are likewise refused, naming both files. `export default <literal>` accepted, lowers to nothing. compilerOptions moved NodeNext → ESNext/Bundler/Force (NodeNext classified bare `.ts` directories as CommonJS via package.json sniffing); the gate re-imposes Node's permanent extension rule as STA1113 (never) since Bundler would resolve extensionless specifiers. Evidence + decisions: plan-notes 78. Check: `pnpm run ci` green (figures below); decision tests `subset_cyclic_imports_{ts,js}` (STA3001) and `subset_{import,export}_declarations_{ts,js}` flipped from expected-fail; golden `tests/golden/{ts,js}/modules/` (`main → b → c`) prints `init c / init b / init a` then computed values, byte-for-byte with Node; `tests/unit/graph.test.ts` covers topo order, cycle spelling, collision, and the type-only exemption.

**Task 3.12 — Tree-shaking builtins.** Builtins are HIR-level library modules; only referenced ones are emitted/linked. Size target once stable: hello-world < 500 KB (competitors report 170–330 KB — sources conflict; measure current releases yourself, record in `tests/bench/`).

  ✅ **Done (2026-08-30).** "Only referenced ones are linked" is the linker's job, done at function granularity: the runtime archive compiles with `-ffunction-sections -fdata-sections` and the release link passes `-Wl,-dead_strip` (Mach-O) / `-Wl,--gc-sections` (ELF), so hello-world drops from 53 linked `jsrt_*` builtins to the 5 it references (`init`, `frame_init`, `string_from_utf8`, `print`, `panic`) and from 72 KB to 51.8 KB — the < 500 KB target is met with ~10× headroom (recorded per-fixture in `tests/bench/baseline.json`, refreshed). Sanitized builds skip stripping (ASan global-registration sections are what `--gc-sections` drops). The task's "HIR-level library modules" phrasing described a builtin representation that does not exist yet — every builtin is a C runtime function, and none is authored at HIR level to shake (plan-notes 79); the emitter already emits only user code. Check: `tests/unit/cli.test.ts` asserts a built binary contains `jsrt_print` and not `jsrt_map_new`; golden 44/44 under both release and ASan runtimes after the flag change; full `pnpm run ci` green (figures below).

**Check per rung:** golden tests match Node; HIR verifier clean; the construct's decision tests flip from expected-fail to passing. *(This third clause was unmeetable until 2026-08-29: every fixture ended in `export {…}`, so all 152 asserted only "modules are not-yet". Fixed in plan-notes 42 — a fixture must not depend on a construct it does not name.)* **Phase exit:** a real ~500-line typed TS program (e.g. a JSON→CSV converter) compiles in `ts` mode and matches Node with ≤3 workarounds (§13 tripwire).

  ✅ **Phase exit met (2026-08-30).** `tests/golden/ts/exitcheck/` — a 477-line transit route planner across five modules (city registry, CSR graph, binary min-heap, Dijkstra + fare rules, report driver) exercising classes, Map, arrays with the append idiom, for-of, generics at two instantiations, exceptions, and the Task 3.11 module graph. Compiles in `ts` mode and matches Node byte-for-byte as a golden fixture (`golden: 45 fixtures — 45 passed`). Workarounds used, three families: (1) `as number/string/boolean` on index reads — the `noUncheckedIndexedAccess` union has no HType, and each cast is a real runtime check; (2) missing Phase-4 globals substituted — `| 0` for `Math.floor`, an integer sentinel for `Infinity`, thrown strings for `new Error`; (3) `.length =` truncation is not in the subset, so the heap tracks a logical count over storage that never shrinks. At the ≤3 boundary, not over it — the §13 tripwire does not fire, and all three families name their Phase-4/object-model lifts. Writing the program also flushed out a real Task 3.11 bug, fixed in the same change: a RELATIVE entry path left the program's fileNames relative while the resolver answered absolute, so every import edge silently missed and legal source died as internal STA4035; `createProgram` now roots the entry absolute, with a cwd-pinned regression test in `tests/unit/cli.test.ts`.

---

## 7. Phase 4 — Runtime v1 (C11; parallel with Phase 3)

**Task 4.1 — Objects.** Fixed-shape structs for compiled classes; a shape table (hidden classes) + per-site inline caches **only for the dynamic residue** — compiled-path property access is a struct field load, no IC. (Boa's lesson: ICs matter exactly where types are unknown.)
✅ **Done.** The fixed-shape half landed with Phase 3 rung 6 (classes and literal layouts — a field read is an offset load, no IC). This task added the dynamic residue: `JSRTShape` transition chains off one root shape, `JSRTDynObject` with out-of-line doubling slot storage, and per-SITE `JSRTIC {shape, offset}` caches, filled only on hit — get-misses answer `undefined` and are never cached, and construction stores carry `NULL` caches because every one transitions (docs/VALUE.md §4.10, `runtime/src/jsrt_shape.c`, print corpus `print_shapes`). The frontend consumer: a literal whose CONTEXTUAL type (`getContextualType ?? getTypeAtLocation` — the annotation must win, since later reads go through it) has an optional property or index signature lowers to `DynObjectLiteral`, and property sites on such receivers to `DynFieldAccess`/`DynFieldAssignment`, all typed Unknown under verifier discipline `STA4059` (docs/HIR.md). Structural aliasing of a fixed object into a dynamic site aborts loudly at run time — `STA2004`, the third runtime-emitted diagnostic — rather than guess a slot (plan-notes 80). Check: `pnpm run ci` — 268 unit tests, subset 183 fixtures (112 passed / 71 expected-fail / 0 failed), golden 47/47 both runtimes, ASan/UBSan clean.

**Task 4.2 — Builtins, driven by golden tests.** `Math`, `JSON`, `String.prototype` (~30 hot methods), `Array.prototype` (same), `Object`, `Map`, `Set`, `console`. A builtin counts as implemented when ≥1 golden test exercises it and matches Node. Coverage table `tests/golden/builtins_coverage.json`, rendered in CI (Porffor-style). New builtins enter via `SUBSET.md` + tests first, never ad hoc.
Until this task lands, every global except `console.log` and `undefined` is deferred at the **gate** with a `not-yet` naming this phase — `String`, `NaN`, `Math`, `globalThis` and the rest used to be accepted and then hit `STA4035` in the lowering, which is an internal error raised by legal source (plan-notes 61). The three spellings that only mention a global name (a type position, a property name, and `console` in `console.log`) stay accepted, pinned by `tests/unit/gate.test.ts`.
**In progress — Math slice landed (2026-08-30).** The dashboard exists and runs in CI (`tests/golden/builtins_coverage.json` + `pnpm run test:builtins`, which verifies every claim: fixture exists AND mentions the member). Math's exactly-specified operations are done — `abs ceil floor round sign trunc sqrt pow min max`, all 8 constants, plus the `NaN`/`Infinity` globals — as one `MathCall` HIR node (CollectionOp precedent, `STA4080` verifier discipline) and one ECMA-exact C function each in `runtime/src/jsrt_math.c`; constants fold to the pinned Node's own doubles at lowering (plan-notes 81). The approximated transcendentals (`sin`, `log`, `exp`, `random`, …) are deliberately deferred until fdlibm is vendored — golden tests are byte-for-byte against Node, whose answers come from V8's fdlibm, not the host libm.
**String slice landed (2026-08-30).** 20 `String.prototype` methods (`charAt charCodeAt indexOf lastIndexOf includes startsWith endsWith slice substring split replace replaceAll repeat padStart padEnd trim trimStart trimEnd toLowerCase toUpperCase`) as one `StringOp` HIR node driven by the `STRING_OPS` table in `src/hir/nodes.ts` — the gate, the lowering, the verifier (`STA4081`), and the emitter (mechanical camelCase→`jsrt_string_snake_case` name derivation) all read the same table. Omitted optional arguments are padded with `undefined` literals at lowering (ECMA-262 treats explicit `undefined` as absent for every op in the set). `replace`/`replaceAll` implement GetSubstitution for plain-string patterns; `repeat`'s RangeError and non-ASCII case mapping raise `STA2005` at run time rather than answer wrongly (plan-notes 82). Remaining: `JSON`, `Array.prototype`, `Object`, `console` beyond `log`.
**Array slice landed (2026-08-30).** 13 non-callback `Array.prototype` methods (`push pop shift unshift at indexOf lastIndexOf includes join slice concat reverse fill`) as one `ArrayOp` HIR node on the `ARRAY_OPS` table discipline (verifier `STA4082`; `join` lives in `jsrt_print.c` with the ToString machinery, the rest in `runtime/src/jsrt_array_ops.c`; shared index conversions extracted to `jsrt_index_util.h`). `includes` is SameValueZero (finds NaN), `indexOf` strict (cannot) — the spec's asymmetry, golden-tested. `lastIndexOf` lands without its position argument because explicit `undefined` ≠ absent there (plan-notes 83). Deferred: every callback-taking method — they need a runtime→compiled-code call protocol. Remaining now: `JSON`, `Object`, `console` beyond `log`, and the callback protocol.
**console slice landed (2026-08-30).** `info`/`debug`/`warn`/`error` join `log` as the same single HIR node with a `stderr` flag — the one fact the emitter needs. `warn`/`error` map to `jsrt_eprint` (stderr, `log`'s exact formatting), and the golden runner now compares BOTH streams byte-for-byte, so the stream split is held to Node's rather than asserted (plan-notes 84). The rest of console stays deferred by the member path. Remaining now: `JSON`, `Object`, and the callback protocol.
**Object slice landed (2026-08-30).** `Object.keys`/`values`/`entries` as one `ObjectStaticCall` HIR node (namespace call, MathCall-style; verifier `STA4083`, runtime contract `STA4084`) over one runtime walk in `runtime/src/jsrt_object_ops.c` covering both object layouts: fixed shapes enumerate their class descriptor's field list, dynamic shapes their shape chain — declaration order and insertion order respectively, both the spec's enumeration order since identifier keys never trigger the integer-first reorder. `entries` yields `[string, T]` pairs the HType model cannot spell (no tuple), so its element is Unknown and the verdict honestly reports `dynamic` (plan-notes 85). Remaining now: `JSON` and the callback protocol.
**JSON slice landed (2026-08-30), stringify only.** `JSON.stringify(v)` single-argument form as a `JsonStringify` HIR node (namespace call, ObjectStaticCall-shaped, pinned `string` — verifier `STA4085`) over one recursive runtime walk (`jsrt_json_stringify` in `jsrt_print.c`, reusing the Object.entries walk for both object layouts and `format_double` with `-0` spelled `"0"`). Escaping is well-formed `JSON.stringify`: short escapes, `\u00XX` controls, lone surrogates as `\udXXX`, UTF-8 for everything else. The gate refuses top-level argument types admitting `undefined`/functions (the spec answers `undefined` there against the node's `string`); inside structures both serialize per spec, and cycles abort loudly on the STA2005 pattern (spec throws TypeError, which builtins cannot raise yet). Deferred: replacer/space forms, and `JSON.parse` — parse returns `any` (STA1003 in ts mode before the gate speaks) and needs the untyped-result story (plan-notes 86). Remaining now: the callback protocol.
**Callback methods landed (2026-08-30).** `forEach map filter some every find findIndex` joined `ARRAY_OPS` — no new protocol was needed: the runtime calls the compiled callback through `jsrt_call`, the SAME closure ABI every compiled call site already dispatches through, passing the spec's `(element, index, array)` triple, caching `length` at entry, and coercing predicate answers through `jsrt_truthy`. Two result kinds joined the table: `mapped` (the checker's answer — `map`'s element is the callback's to choose, and a type-guard `filter` narrows below the receiver; verifier pins only "some array") and `undefined` (`forEach`). The gate holds the single argument to a function type (an `any` callback in js mode defers rather than reaching `jsrt_call` unvetted) and defers the thisArg form. `reduce`/`reduceRight` followed in their WITH-initial form (result kind `checker` — nothing pinned; the zero-initial form is deferred because an explicit `undefined` initial IS an initial, plan-notes 88). `sort` closed the family out (plan-notes 89): a stable merge — stability is normative, so no qsort — whose scratch is a real jsrt array (a collector must see elements mid-merge); absent and explicit-`undefined` comparators both mean the ToString default, so the padding rule holds. The structural quartet `flat`/`flatMap`/`splice`/`copyWithin` followed (plan-notes 90): `splice` in its exact two-argument form only (its one-argument form deletes to the end — the `lastIndexOf` padding trap — and insertion is variadic); the other three pad safely. The find-last pair, the ES2023 `toX` copies, `toString` (= `join`), and `with` (out-of-range aborts, STA2005 pattern) closed the surface to 34/37 — the residue is exactly the three iterator methods, which wait on an iteration protocol (plan-notes 91 records the `Object.hasOwn` bug this slice surfaced: a bare `in` test against the op tables found `toString`/`valueOf`/`constructor` on the PROTOTYPE CHAIN). Task 4.2's remaining surface: `Math` transcendentals (fdlibm question), `String` regex-adjacent methods (Task 4.3), `reduce`/`sort`/`splice`/`flat`, `JSON.parse`, remaining `Object`/`console` members.
**Math bit-exact trio landed (2026-08-30).** `clz32`/`imul`/`fround` joined `MATH_METHODS`: each is exactly specified (leading zeros of ToUint32; int32 wrap-around multiply, computed unsigned so the overflow is defined C; a round-trip through IEEE single precision), so the fdlibm question that holds back the transcendentals does not arise. Math now 21/43; the remainder is the approximated set (`sin`, `log`, `exp`, …, and `random`), all waiting on the fdlibm vendoring decision plus a seeding story for `random`.
**String addendum (2026-08-30).** `at`/`codePointAt` (result kind `element` — honestly Unknown, they answer `undefined` out of range; `codePointAt` combines surrogate pairs), `concat` (exactly one argument; its mechanical C name IS `jsrt_string_concat`, the `+` primitive — zero new runtime code), and identity `toString`/`valueOf` close `String.prototype` to 25/32; the residue is `normalize`/`localeCompare` (Unicode/Intl tables) and the regex-shaped set (Task 4.3). Landing `valueOf` as a table entry retargeted the hasOwn regression test at `hasOwnProperty`.

**JSON.parse landed (2026-08-30), completing the namespace.** `JSON.parse(text)` single-argument form as a `JsonParse` HIR node — the same one-argument-one-slot namespace shape as `JsonStringify`, and its exact opposite in the verifier: nothing is pinned, because the result is data the checker cannot see into. The lowering types it **Unknown**, so `explain` reports the call as the point where a program becomes dynamic and Task 3.5's boundary machinery (`typeof` narrowing, an `as` cast, `jsrt_check_*`) is what settles each use. In ts mode that means the ANNOTATED spelling — `const v: unknown = JSON.parse(t)`; unannotated, the lib's `any` return trips STA1003 at the declaration before the gate speaks, which the subset fixtures record as the honest verdict for that spelling. The runtime parser (`runtime/src/jsrt_json.c`) is recursive descent over the text's UTF-16 code units, building dynamic-shape objects through `jsrt_set_prop` (so duplicate keys resolve exactly as the shape table already resolves them — last value, first position) and real jsrt arrays, with `strtod` on the ASCII the number grammar admitted. Four conditions abort loudly on the STA2005 pattern rather than answer wrongly: malformed text, a key containing U+0000 (shape keys are C strings), nesting past 512 (a stack fault is a crash, not a diagnostic), and a non-string reaching the call at run time — the gate ACCEPTS an untyped argument, which is the js-mode norm, and lets the runtime settle the tag. The reviver form is deferred: it runs user code at every node of the result. Coverage: **93/145 (64%)**, `JSON` at 2/2. Task 4.2's remaining surface: `Math` transcendentals (fdlibm question) and `Math.random` (needs a determinism story), the `String` regex-adjacent methods (Task 4.3), the three `Array` iterator methods (iteration protocol), and the remaining `Object`/`console` members.

**Object namespace addendum (2026-08-30).** `getOwnPropertyNames`, `hasOwn` and `fromEntries` joined the namespace, taking `Object` to 6/13 and the dashboard to **96/145 (66%)**. `getOwnPropertyNames` IS the `keys` walk for every object the subset can build — both layouts hold only string-keyed, enumerable own properties, so the entry points diverge only once non-enumerable properties become expressible. `hasOwn` asks the shape chain (or the class descriptor) directly: neither layout has a prototype the subset can reach, so “own” needs no second question. `fromEntries` is the walkers' mirror — it takes the ARRAY of pairs and BUILDS a dynamic shape, so its result is Unknown and its verdict `dynamic`, and duplicate keys resolve the way the shape table already resolves them (last value, first position). Two structural consequences: `ObjectStaticCall` now carries an argument LIST (arity fixed per method by the gate's `OBJECT_STATICS` table, restated in the verifier's `OBJECT_STATIC_SHAPES` with result kinds in the collection-table idiom), and its emit merged into `MathCall`'s N-argument case, the shape it now shares. A JS string becomes a shape key in ONE place — `jsrt_shape_key` in `jsrt_shape.c`, the immortal UTF-8 copy the shape table's own lifetime rule demands — which `JSON.parse` and `fromEntries` both call. Still deferred, each for a reason: `assign` mutates a target a fixed shape cannot accept and is variadic; `freeze`/`isFrozen` need a frozen bit every write site would consult; `create`/`defineProperty`/`getPrototypeOf`/`setPrototypeOf` are prototype machinery ts mode bans by design.

**console namespace addendum (2026-08-30).** `dir`, `group`, `groupEnd`, `count`, `countReset` and `assert` joined `log`/`info`/`debug`/`warn`/`error`, taking `console` to 11/15 and the dashboard to **102/145 (70%)**. The slice replaced `ConsoleLogCall`'s `stderr` boolean with a `method` name and one table, `CONSOLE_METHODS` in `src/hir/nodes.ts`, that the gate, the lowering, the verifier (`STA4019` now covers arity as well as void-ness) and the emitter all read — the `ARRAY_OPS`/`STRING_OPS` discipline applied to a namespace whose members differ in arity rather than in receiver. Each entry gives an arity, a count of OPTIONAL trailing arguments, the C entry point, and — for the two members that need it — a second entry point for the short form. That second name is the slice's one real finding: the padding rule (`STRING_OPS` pads, `lastIndexOf` cannot, plan-notes 83) splits console down the middle. `count()` and `count(undefined)` both tally under `default`, so `count` pads; but Node prints `console.group(undefined)` as `undefined` and `console.assert(c, undefined)` as `Assertion failed undefined` where the omitted forms print nothing, so padding those would print nothing for source a program can legally write. They get `jsrt_console_group_bare`/`jsrt_console_assert_bare` instead — the third answer to the `lastIndexOf` question, available because the runtime function is ours to split — and `consoleEntryPoint` is the one place a width maps to a call, asked by the verifier and the emitter alike (plan-notes 94). Three runtime facts are Node's, held byte-for-byte on both streams: `dir` is `log`'s formatting WITHOUT its top-level-string exception, so `console.dir("a")` prints `'a'`; `group`/`groupEnd` keep an indent that prefixes EVERY line of a multi-line inspect and an unmatched `groupEnd` is a no-op; `count` tallies per label and prints `label: n`. Deferred, and for a reason that will not change: `time`/`timeEnd` print an elapsed DURATION and `trace` a stack, neither of which a golden test can hold to Node byte-for-byte, and `table` is a column-layout algorithm of its own. Task 4.2's remaining surface: `Math` transcendentals (fdlibm question) and `Math.random` (determinism story), `String.prototype` `normalize`/`localeCompare` (Unicode/Intl) and the regex-shaped set (Task 4.3), the three `Array` iterator methods (iteration protocol), and the `Object` prototype/mutation residue.

**Map/Set joined the dashboard (2026-08-30).** Task 4.2 names `Map` and `Set` among the builtins it covers, and both landed back at rung 7 with `tests/golden/{ts,js}/maps.*` — but neither was a namespace in `tests/golden/builtins_coverage.json`, so the dashboard was reporting a percentage of a surface that silently excluded them. Adding `Map.prototype` (10 members) and `Set.prototype` (16) moves the number from 102/145 (70%) to **113/171 (66%)**: the coverage did not fall, the denominator got honest. `Map` is 6/10 and `Set` 5/16; the shared gap is the iteration quartet (`entries`/`forEach`/`keys`/`values`), which is the same iteration-protocol blocker the three `Array` iterator methods wait on, and `Set`'s remainder is the ES2025 set operations. Adding them required one fix to the renderer: a `.prototype` member was matched by CALL syntax (`.trim(`), which no property can satisfy, so `size` would have been unverifiable — the needle is now access syntax not followed by an identifier character, which checks a property and still keeps `.trim` from matching inside `.trimStart` (plan-notes 95).

**A throwing callback was neither stopping nor propagating (2026-08-30).** Landing the `Array.prototype` callback family (`forEach`/`map`/`filter`/`some`/`every`/`find*`/`reduce*`/`sort`/`flatMap`) left both halves of the exception protocol unwired, and a golden fixture that throws from inside a callback found it: `[1,2,3].forEach(cb)` where `cb` throws on the second element printed all THREE elements and the surrounding `catch` never ran. The runtime kept walking because its loop guards asked only about the length, and the emitter never checked `jsrt_pending()` after the op, so the pending exception was dropped on the floor — the program silently continued past a `throw`. Both halves are now closed: `ARRAY_OPS` entries carry `calls: true` (the 13 ops that call back into compiled code), the runtime's walks share one `walking()` guard that includes `!jsrt_pending()`, and the emitter gives a `calls` op its own statement plus the pending check that `call`, `new` and `method-call` already emitted. Getters were checked and were never affected — they lower to a method call, which had the check all along. The regression is pinned in both `array_callbacks` fixtures, which now cover a throwing callback, predicate, comparator and reducer (plan-notes 96).

**Map/Set `forEach` landed (2026-08-30).** The one member of the deferred iteration group that was never an iteration-protocol question: `forEach` takes a CALLBACK, and the runtime calls it through `jsrt_call` exactly as the `Array.prototype` callback ops do — so it needed no protocol the subset lacks, and it joined `COLLECTION_OPS` with the same rules those follow (function-typed callback required, thisArg form deferred, its own emitted statement plus a pending check so a throwing callback reaches its landing pad). It passes the spec's `(value, key, collection)` triple — for a Set the value IS the key — and sees mutation during the walk the way the spec requires. That last requirement is what the slice actually cost: the table's `grow()` COMPACTS dead entries away, which renumbers every live one, and a walk holds an index — so a `delete` that triggers a growth mid-walk would silently skip or repeat entries. `JSRTMap` gained an `iterating` depth counter that suppresses compaction (not growth) while any walk is in flight; it is initialised in `map_new` and deliberately NOT in `map_reset`, because `clear()` resets through that path and a clear called from inside a `forEach` must not re-enable compaction under the walk that called it. Both `maps` fixtures now cover the triple, short callbacks, delete-and-reinsert order, mutation and growth during the walk, `clear()` during the walk, nested walks, and a throwing callback. Dashboard: 113/171 → **115/171 (67%)**; the residue of the group is exactly the iterator quartet (plan-notes 97). The slice also surfaced a rung-7 bug the table could not have shown before it: a key inserted as `-0` was STORED as -0, because SameValueZero governs comparison and the spec's normalization (§24.1.3.9 step 6, §24.2.3.1 step 4) happens at the INSERT. No read path could tell — every one of them went back through SameValueZero — until `forEach` handed the key to user code and `1 / k` answered -Infinity. One guard in `map_put` closes it (plan-notes 98).

**The ES2025 set operations landed (2026-08-30).** `union` `intersection` `difference` `symmetricDifference` `isSubsetOf` `isSupersetOf` `isDisjointFrom` joined `COLLECTION_OPS`, taking `Set.prototype` from 6/16 to 13/16 and the dashboard from 115/171 to **122/171 (71%)**; the residue is the iterator trio. They are the only operations in the subset whose ARGUMENT is a collection, which is what the slice is really about: the runtime reads it as a `JSRTMap`, so a wrong argument is memory corruption rather than a wrong answer, and neither the arity check nor the receiver check would catch it — hence a `SET_OPS` table in `src/hir/nodes.ts` that the gate, the verifier and the emitter all read, and a verifier check on the argument's type kind and the result's. The spec's set-LIKE argument (any object with a `size`, a `has` and a `keys`) is refused: reading one means calling its `keys()` iterator, the protocol the trio waits on. Result ORDER is normative and is not always the receiver's — `intersection` walks whichever collection is smaller and answers in that one's order — so the fixtures pin every combination's order against Node rather than treating it as an implementation detail (plan-notes 100). The slice also raised the lib the compiler hands USER SOURCE from es2023 to es2025: the lib describes the JavaScript the differential ground truth implements, not the subset Stator has landed, because the gate is what states the subset and `STA1214` names the delivering phase — where too low a lib produced a type error telling the user to change a `lib` option they do not own (plan-notes 99).

**Task 4.3 — RegExp.** Vendor QuickJS-NG's `libregexp` (+ its `cutils`/`libunicode` dependencies) into `runtime/vendor/` — small, proven, designed for embedding. Do not write a regex engine; do not pull PCRE2/ICU.

**Task 4.3 landed (2026-08-30).** `libregexp` (+ `libunicode`, `cutils`) is vendored from quickjs-ng `v0.16.2` into `runtime/vendor/quickjs-ng/`, recorded in its own `VENDOR.md`, and compiled with `-Wall` alone rather than this repo's `-Wall -Wextra -Werror`: upstream code is not ours to fix, and a warning flag is not a correctness flag (plan-notes 101). The engine asks its embedder for exactly three functions — an allocator, a stack-depth question and a timeout question — and `runtime/src/jsrt_regexp.c` is the whole bridge. Two facts about that bridge were read out of the engine rather than assumed: `lre_compile` takes UTF-8, or CESU-8 when the pattern is not a unicode one (a lone surrogate is legal in a non-unicode pattern and has no UTF-8 encoding), and the capture array must be sized by `lre_get_alloc_count`, NOT by twice the capture count — the executor spills its own registers into the same array, and upstream's comment records the heap overflow that taught it. The subject needs no conversion at all: our strings ARE UTF-16 code units, which is `cbuf_type` 1, and the engine promotes that to 2 by itself for a unicode pattern. Above the C boundary, `RegExpLiteral` and `RegExpOp` joined the HIR on the `StringOp` table discipline (`REGEXP_OPS`, verifier `STA4086`): the pattern and the flags travel as TEXT, so nothing in this compiler parses them and nothing in it can disagree with the engine, and the literal is compiled at EVERY evaluation rather than hoisted — §22.2.4.1 makes each evaluation a fresh object, and it has to be, because `lastIndex` is mutable state on it (plan-notes 102). `test` is the landed surface; `exec` and the non-global `match` stay under `STA1211` because they answer an array WITH properties and a jsrt array is dense with no property table, and `new RegExp(...)` stays deferred because a pattern that is not in the source is a pattern the compiler cannot see. Dashboard: **123/186 (66%)**, `RegExp.prototype` at 1/15 — the denominator grew by the whole prototype, which is the dashboard's rule (plan-notes 95). Next on this task's own ground: the RegExp-taking `String.prototype` methods.

**Task 4.3, second slice (2026-08-30): the regexp-taking String methods.** `search` joined `STRING_OPS`, and `split`/`replace`/`replaceAll` gained their regexp forms — as the SAME op node, not new ones: the runtime dispatches on the pattern's TAG, because a regexp pattern is a scan and a string one is a substring search, and nothing above the C boundary needs to know which. The algorithms live in `jsrt_regexp.c` rather than `jsrt_string_ops.c` because all three are the engine's: one `scan()` collects every match's group offsets in a single pass, and search/split/replace are three readings of that list. Three spec details were settled against Node rather than guessed (plan-notes 103): `@@split`'s loop runs `while q < size`, so a match starting AT the end of the subject is never attempted — which is the whole reason `'abc'.split(/(?:)/)` is three elements and not four, and the golden fixture caught the fourth; `@@split`'s splitter is STICKY, so a failed attempt retries one position later rather than ending the scan, which is the one place the two loops the spec writes actually differ; and `$n` substitution caps at the pattern's group count, so `$1` in a groupless pattern stays literal. `search` never leaves `lastIndex` behind (§22.2.5.9 saves and restores it) while `replace` follows RegExpBuiltinExec's rule — a cursor is read and written only by a `/g` or `/y` pattern. `replaceAll` with a non-global pattern aborts loudly (the spec throws TypeError). Deferred, with a shared reason: `match`/`matchAll` answer an array WITH properties, `exec`'s blocker, and a replacer FUNCTION runs user code per match. Dashboard: **124/186 (67%)**, `String.prototype` at 26/32.

**Task 4.3, third slice (2026-08-30): libunicode pays a debt.** Vendoring libregexp brought libunicode with it, and the tables it needs for case folding are the same ones `toUpperCase`, `toLowerCase` and `normalize` need. Until now case mapping above ASCII ABORTED (`STA2005`) rather than answer wrongly — an honest placeholder for legal source, and one this slice retires. `runtime/src/jsrt_unicode.c` is the bridge, and it works in code POINTS rather than code units, because neither operation can be expressed as a per-unit walk: one code point can map to three (`ß` → `SS`, `ﬃ` → `FFI`), an astral character is one code point across two units, and `normalize` reorders and composes. The one context-dependent rule ECMA-262 keeps came with it — Final_Sigma, where `Σ` lowercases to `ς` at the end of a word and to `σ` inside one — implemented on `lre_is_cased`/`lre_is_case_ignorable`, which is the only reason libunicode exports them (plan-notes 104). `normalize` joined `STRING_OPS` at arity 1: an absent form means NFC, so the padding rule holds for one more op, and a form that is not one of the four aborts loudly (the spec throws RangeError). An ASCII string still takes the old per-unit path — it cannot change shape, so decoding it would buy nothing. Dashboard: **125/186 (67%)**, `String.prototype` at 27/32, and the residue is now exactly two families: `match`/`matchAll` (an array with properties, `exec`'s blocker) and `localeCompare`/`toLocale*`, which are collation and TAILORED casing rather than Unicode's own tables — Task 4.4's question, handed to it cleanly.

**Task 4.4 — Intl/ICU.** Behind a Makefile feature flag, **off by default** — `make -C runtime intl` writes `runtime/build-intl/libjsrt.a` and `STATOR_RUNTIME=intl` links it. The cost is a DEPENDENCY, not a fatter binary: Boa's +10 MB is what a static link costs, and Stator links the system ICU, so the program gains two `LC_LOAD_DYLIB` entries and needs 37 MB of shared library present on the machine that runs it (32 MB of it `libicudata` — the CLDR tables). Corrected against measurement in plan-notes 105.

**Task 4.4 landed (2026-08-30).** The three members `String.prototype` was still missing for a reason that was not scheduling: `localeCompare`, `toLocaleUpperCase` and `toLocaleLowerCase`. Unicode's own tables — the ones Task 4.3's third slice vendored — cannot answer either question. Collation is a per-locale ORDER (`'ä'` is an A with an accent in German and a letter after Z in Swedish) and tailored casing a per-locale EXCEPTION to the default mapping (`'i'` uppercases to `'İ'` in Turkish); both are CLDR data. They joined `STRING_OPS` like every other op, so the gate, the lowering, the verifier and the emitter needed no case of their own — the whole task is a build flag, a gate rule, and `runtime/src/jsrt_intl.c` over `ucol_strcoll`/`u_strToUpper`/`u_strToLower`. Three decisions carry it: the ICU objects live in their OWN directory, because `make` can see a stale timestamp but never a stale `-DJSRT_HAVE_ICU`; the link flags are written next to the archive by the build that produced it and read back by the CLI, so the two cannot disagree about which ICU this is; and the locale argument is REQUIRED even with the flag on, because the spec's absent-locales form reads the host's default and a compiled program whose output depends on the machine that runs it is not one this repo can golden-test. Without the flag the gate refuses all three under the new **STA1215**, which names the flag rather than a phase. `pnpm run ci` stays ICU-free and green (79 golden fixtures); `pnpm run test:intl` builds the feature runtime and runs 81, the two extra being `intl_locale.{ts,js}` — Turkish casing, Swedish and German collation, and Greek final sigma, all byte-for-byte against the pinned Node, which bundles the same ICU 78.3 / Unicode 17.0. Dashboard: **128/186 (69%)**, `String.prototype` at 30/32, and its residue is now exactly `match`/`matchAll` — the array WITH properties that also blocks `exec`, and no longer a data question at all.

**Task 4.5 — GC hygiene tests.** Compile a loop allocating 10M objects — RSS plateaus; shadow-frame discipline audited by a codegen test that diffs emitted frames against emitted locals; and a golden fixture holding live values across repeated collections, which is what proves the collector can SEE a NaN-boxed reference at all.

**Task 4.5 landed (2026-08-30).** Both halves, and each found something the other could not have.

The **leak test** (`tests/leak/`, `pnpm run test:leak`, in `ci`) compiles the 10M-object loop and samples the process's RSS from `ps` — not from a counter the runtime keeps, which would be the runtime grading its own homework. It asserts a PLATEAU, never a figure: a peak inside a bound no non-collecting run could meet, and a tail that does not keep climbing. Measured both ways on this machine: **3056 KB flat with Boehm, 284 MB and still rising without it**, so the 64 MB cap separates the outcomes by a factor of five. Running it at all required installing `bdw-gc`, and that instantly turned all 79 golden fixtures red — `src/cli/build.ts` had never passed `-lgc`, because no machine this repo had run on had Boehm and the fallback was the only path ever taken (plan-notes 106). The fix generalised Task 4.4's mechanism: every build now records its link flags next to the archive it produced, and the CLI reads them back for every flavour.

The **frame audit** (`tests/unit/frames.test.ts`) emits the C for every standalone golden fixture and holds each function to four invariants: no `JSRT_LOCAL(i)` outside its own frame (the one failure here that is memory corruption rather than waste), a frame exactly as large as the slots written into it, a globals frame exactly as large as the globals used, and a `JSRT_FRAME_POP()` on every path out — every `return` and the fallthrough. It failed on three over-allocations the moment it was written, all of them the counting pass reserving storage the emitter had a better home for: a CAPTURED local that already lived in the heap environment, an unconditional return slot in functions that never return a value, and a scratch slot claimed by `{}` for an entry it does not have (plan-notes 107). One reservation stays conservative and is counted as an allowance rather than pretended away: a `try`/`finally`'s exception stash, whose need is decided while emitting the try body, long after `JSRT_FRAME(n)` had to be final.

Neither test can see what the other sees. The audit proves the emitted C declares the slots it writes; only the leak test can tell a runtime that collects from one that never frees, because both print the same number.

Neither could see the third thing, and it was the one that mattered: **the collector could not see a single reference the runtime held.** Boehm is conservative — it retains what looks like a heap address — and a NaN-boxed `jsrt_value` never does, because the tag sits above bit 48. Every object reachable only through a boxed reference (a Map's entries, an array's elements, an object slot, a `JSRT_LOCAL`) was collectible while live; a probe holding a 200-entry Map across a forced collection SIGSEGV'd, and the reason no test had ever said so is that every fixture allocated too little to reach Boehm's first collection. `bdw-gc 8.2.12` predates `GC_set_pointer_mask`, so the fix unboxes explicitly at both places a reference hides, in the new `runtime/src/jsrt_gc.c`: a custom object kind whose mark procedure masks every word it scans, and a `GC_set_push_other_roots` walk of the `JSRT_FRAME` shadow stack — the first thing that has ever READ those frames. Consolidating all fourteen collected allocations behind one `jsrt_gc_alloc` is what makes "the whole heap" a fact rather than a hope (plan-notes 108). The same reasoning found a second invisible cell — `jsrt_throw`'s pending-exception mailbox, static storage holding the only reference to a value while the `finally` blocks on the way out allocate — whose rooting invariant jsrt_value.h had written down and nothing had implemented. `tests/golden/ts/gc_reachability.ts` is the standing check, and its heap half is provably not vacuous: with the hooks removed it is the suite's one failure, a SIGSEGV. Its unwind half is not — it passes with the exception root removed too, because at `-O2` the thrown value survives in a register the collector happens to scan, and plan-notes 108 says so rather than banking the coverage.

**Task 4.6 — `async`/`await` + generators** (starts once Task 3.1's HIR is stable; flips the subset matrix's not-yet rows): state-machine lowering in HIR + a single-threaded microtask queue + minimal event loop in the runtime; no libuv until timers/IO demand it.

**Check:** runtime unit tests + ASan/UBSan clean + the leak test; builtins dashboard renders in CI; an async golden test (`await` chain + `Promise.all`) matches Node.

**Task 4.6 landed (2026-08-30), async half only.** `async`/`await` works; generators do not, and the two were split apart rather than shipped together, because the state machine is only half of what a generator needs — the other half is the iterator protocol, and a `yield` answers its caller where an `await` answers a scheduler. Generators keep their own subset rows and stay not-yet under **STA1201** — which now names **Phase 5** rather than the phase closing here, because what they still need is the iterator protocol, and that is the same blocker holding `for-of` and the `keys`/`values`/`entries` triple that `Array`/`Map`/`Set` are each missing. Four surfaces, one owner: Phase 5 step 8 (plan-notes 112).

The decision the whole task rests on: **a reaction is a native continuation** — a C function plus GC-allocated state — not a JS callback. An async function's resume point and `Promise.all`'s per-element handler are the same kind of thing, so one mechanism (`jsrt_promise_subscribe`) serves both and neither needs `.then` to exist. That is why the deferred list reads oddly: `Promise.resolve`/`reject`/`all` are implemented while `.then` is not. `.then` is not the foundation here, it is a future *client* of it — a reaction whose state is the JS handler and the derived promise — and what blocks it is that a handler's throw must become a rejection, which needs a runtime-level catch around user code (**STA1216**, Phase 5, along with `new Promise(executor)` for the same reason).

Two rules carry ordering, which is the part of a promise implementation that is easy to get subtly wrong and observable when you do: a reaction is always QUEUED and never run inline, even when the promise it subscribes to has already settled; and reactions run in registration order. `jsrt_await` subscribes to `jsrt_promise_resolve(operand)`, so awaiting a non-promise still costs exactly one tick — which is what makes an interleaving match Node's rather than merely finishing with the same answer. The event loop is `jsrt_run_microtasks()` and nothing more: no timers, no I/O, so no macrotask phase and no libuv.

In codegen an async unit is **two C functions**. The entry point keeps the closure ABI, builds the heap environment that outlives every suspension, and hands it to `jsrt_async_start`, which runs the body's prefix synchronously on the caller's stack (observable, and the difference between an async function and a callback). The resume function holds the body: each `await` parks a state number, subscribes, pops the frame and returns; each resumption rebuilds the frame and jumps to the suspension point. **Nothing lives in the C frame across a suspension** — every local of an async unit is addressed as `_jsrt_env->slots[i]` — and that is precisely what makes a `goto` into the middle of a loop or a `try` block correct rather than a hazard.

Unhandled rejections are counted at settle and checked **after** the drain, not at the rejection: a promise rejected now is routinely awaited by a continuation still sitting in the queue, and only an empty queue settles the question. The check then aborts with the `STA2005` pattern rather than swallowing, because matching Node's report byte-for-byte means an `Error` object with a stack this runtime does not build yet — and silently discarding a rejection is the one outcome that would be wrong without saying so.

Ground truth comes in a pair, `runtime/tests/print_promise.{c,mjs}`: the same promises, the same subscriptions, the same order, expressed as native continuations on one side and `.then` on the other. That is the only way this file can assert anything about ORDER — an implementation cannot check its own tick count against itself. The golden half is `{ts,js}/async_await.{ts,js}`: interleaved starts, a three-deep await chain, a throw in an async body caught by an awaiting `try`, and `Promise.all` proving input order survives out-of-order settling plus first-rejection-wins. The js fixture prints its `Promise.all` result whole rather than indexed, because without an annotation the checker calls it a tuple and indexing one is a property access the js tier does not have yet (STA1214) — the claim under test is order, and printing the array whole makes it.

Auditing the emitted diagnostics against `docs/DIAGNOSTICS.md` found four codes with no table row, and one of them was worse than missing: top-level await had been renumbered from the allocated **STA1208** to a fresh code, which the sole-allocator rule exists to prevent. Restored, and the Promise-callback code renumbered down to keep the band contiguous (plan-notes 110). Top-level await and `import()` moved from Phase 4 to Phase 7 in `docs/SUBSET.md`, where the module work actually lives. `pnpm run ci` is green end to end: 290 unit tests, 253 subset fixtures (188 passed, 65 expected-fail, 0 failed), 82 golden fixtures, the print corpus byte-for-byte against Node under both `-O2` and ASan/UBSan, and the leak test at 3072 KB of a 65536 KB cap. Dashboard: **131/197 (66%)** — down from 69%, because `Promise` and `Promise.prototype` joined the surface with their combinators empty, and a namespace that grows the denominator honestly is the point of the dashboard (plan-notes 95).

---

## 8. Phase 5 — `js` mode lands (est. +4–6 weeks; needs Phase 4's shapes/ICs)

Until here, every pipeline stage was built `ts`-mode-first but mode-agnostic below the gate (§0.8). This phase turns on the second policy.

Steps:
1. Frontend: `allowJs` + `checkJs`-style inference in the `ts.Program`; per-function "typed | inferred | dynamic" provenance recorded into HIR (drives boundary insertion and `explain` output).
2. Gate: switch the diagnostic table by mode — `any` becomes dynamic, `var` becomes legal, `.js` files accepted; `eval` flips from never(ts) to not-yet(js).
3. Lower `var`: function-scoped binding, hoisting, `undefined` init; decision + golden tests (classic hoisting pitfalls, loop-var closure capture).
4. Dynamic lowering completion: property access/call/index on `Unknown` receivers through shapes + ICs (Task 4.1); `==` dynamic path per `NUMERIC.md`.
5. Mixed-graph boundaries: imports from `.js` into `.ts` get boundary checks against the declared/inferred type (same machinery as Task 3.5); a lying JSDoc produces a located runtime type error — add a golden test proving it.
6. JSDoc freebie test: a `.js` file with correct JSDoc types stays on the static path — assert via `stator explain` that its functions report `static`.
7. Flip all `js`-column decision tests from expected-fail; add `tests/golden/js/` including one real ~200-line untyped utility library.
8. **The iterator protocol, and generators with it** (inherited from Task 4.6, which delivered `async`/`await` and deferred the rest — see plan-notes 112). One blocker, three surfaces: `for-of`, the `keys`/`values`/`entries` triple that `Array.prototype`, `Map.prototype` and `Set.prototype` are each missing, and `function*`. Generators are last because they are the only one that also needs a state machine, and Task 4.6 already built that half — a `yield` differs from an `await` in who it answers (its caller, not a scheduler), not in how it suspends. `STA1201` names this phase.

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
