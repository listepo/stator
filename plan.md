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
     iteration of any kind (`for-of`, `keys`, `values`, `entries`, `forEach`), and `WeakMap`/
     `WeakSet`, which need the collector to know what weakness is.

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

**Task 3.11 — Modules.** ESM only, whole-program v0. Build the import graph from the `ts.Program`; **cycles are `STA3001` with source locations** (never silently pick an order); module-init code in topological order. Decision tests: cycle rejected; `a→b→c` initializes c, b, a.

**Task 3.12 — Tree-shaking builtins.** Builtins are HIR-level library modules; only referenced ones are emitted/linked. Size target once stable: hello-world < 500 KB (competitors report 170–330 KB — sources conflict; measure current releases yourself, record in `tests/bench/`).

**Check per rung:** golden tests match Node; HIR verifier clean; the construct's decision tests flip from expected-fail to passing. *(This third clause was unmeetable until 2026-08-29: every fixture ended in `export {…}`, so all 152 asserted only "modules are not-yet". Fixed in plan-notes 42 — a fixture must not depend on a construct it does not name.)* **Phase exit:** a real ~500-line typed TS program (e.g. a JSON→CSV converter) compiles in `ts` mode and matches Node with ≤3 workarounds (§13 tripwire).

---

## 7. Phase 4 — Runtime v1 (C11; parallel with Phase 3)

**Task 4.1 — Objects.** Fixed-shape structs for compiled classes; a shape table (hidden classes) + per-site inline caches **only for the dynamic residue** — compiled-path property access is a struct field load, no IC. (Boa's lesson: ICs matter exactly where types are unknown.)

**Task 4.2 — Builtins, driven by golden tests.** `Math`, `JSON`, `String.prototype` (~30 hot methods), `Array.prototype` (same), `Object`, `Map`, `Set`, `console`. A builtin counts as implemented when ≥1 golden test exercises it and matches Node. Coverage table `tests/golden/builtins_coverage.json`, rendered in CI (Porffor-style). New builtins enter via `SUBSET.md` + tests first, never ad hoc.
Until this task lands, every global except `console.log` and `undefined` is deferred at the **gate** with a `not-yet` naming this phase — `String`, `NaN`, `Math`, `globalThis` and the rest used to be accepted and then hit `STA4035` in the lowering, which is an internal error raised by legal source (plan-notes 61). The three spellings that only mention a global name (a type position, a property name, and `console` in `console.log`) stay accepted, pinned by `tests/unit/gate.test.ts`.

**Task 4.3 — RegExp.** Vendor QuickJS-NG's `libregexp` (+ its `cutils`/`libunicode` dependencies) into `runtime/vendor/` — small, proven, designed for embedding. Do not write a regex engine; do not pull PCRE2/ICU.

**Task 4.4 — Intl/ICU.** Behind a Makefile feature flag, **off by default** (+10 MB when on — Boa's measured cost).

**Task 4.5 — GC hygiene tests.** Compile a loop allocating 10M objects — RSS plateaus; shadow-frame discipline audited by a codegen test that diffs emitted frames against emitted locals.

**Task 4.6 — `async`/`await` + generators** (starts once Task 3.1's HIR is stable; flips the subset matrix's not-yet rows): state-machine lowering in HIR + a single-threaded microtask queue + minimal event loop in the runtime; no libuv until timers/IO demand it.

**Check:** runtime unit tests + ASan/UBSan clean + the leak test; builtins dashboard renders in CI; an async golden test (`await` chain + `Promise.all`) matches Node.

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
- **v2.1** (2026-08-29): **Phase 1 marked ✅ COMPLETE** after re-verifying its Checks with a clean `./ci.sh` run (subset runner: `152 fixtures — 0 passed, 152 expected-fail, 0 failed` — the correct pre-Phase-2 state). The executed step lists and the 26-row seed matrix were removed from §4: `docs/SUBSET.md` (76 rows) and `docs/DIAGNOSTICS.md` are the row/code authorities, and the deviations live in `plan-notes.md` entries 1–19 (incl. the ESLint→Biome swap, #19). **Phase 0 remains open** — no `NICHE.md`, no `phase-0-approved` tag, no initial commit; it was bypassed for Phase 1 on explicit owner instruction and still gates Phase 2 per §15.1. Also open: the Node 26.7.0-vs-LTS pin question (notes #9).
