# done.md — the completion record

Finished work, moved out of `plan.md` so that file stays a roadmap of what is LEFT. This is an
archive, not an authority: nothing here is normative. When a completed task left behind a rule the
compiler still has to obey — the locked `tsconfig.json`, a live Check — that rule stayed in
`plan.md` and only its evidence came here.

Task numbers are unchanged, and `plan.md` keeps a one-line stub for every task below, so a
`plan.md §N Task X.Y` reference in code or docs still resolves to the right place in both files.

Ordering follows `plan.md`: phases ascending, tasks ascending within a phase.

---

## Phase 0 — Go/no-go gate ✅ CLOSED (2026-09-01)

*`plan.md` §3. The gate's five steps stay in `plan.md`: they are the gate's own definition, and
§15.1 — no phase entered without its gate — is enforced by pointing at them.*

~~**Task 0.1 — Build-vs-join check.**~~ ✅ **Approved by the repository owner on 2026-09-01**, by
this document's own title: "Stator niche decision — explicit static/dynamic policy for tooling
binaries". `NICHE.md` names all three required elements — the niche (small standalone
developer-tool and worker binaries being migrated from JavaScript to strict TypeScript, under an
explicit two-mode policy over ONE module graph), the competitor that almost serves it
([scriptc](https://github.com/vercel-labs/scriptc), whose public contract is construct-level static
compilation with an embedded QuickJS-NG fallback), and why it does not: Stator's contract is two
auditable source-POLICY modes in the same graph, with typed/dynamic provenance carried through HIR
and mandatory checks where dynamic JavaScript enters typed TypeScript. Step 3's disqualifier is
answered in the file and stands: if the real requirement is extensible end-user scripting, embedding
an engine is the lower-risk choice and Stator should not be used. Every market claim is a product
SELF-DESCRIPTION with a link — no competitor benchmark number is cited as evidence, per the rule in
AGENTS.md. Two conditions ride with the approval: scriptc is re-evaluated quarterly, and reopening
the decision needs §15.4's bar (new measured evidence in `plan-notes.md`), not a change of mind.

**Check — PASSED** (2026-09-01; re-verified at HEAD `e27e118` the same day, five commits later):
`NICHE.md` exists with the three required elements ✅ (the read is the paragraph above);
`git cat-file -e phase-0-approved:NICHE.md` → exit 0, and
`git log --diff-filter=A --format=%H phase-0-approved -- NICHE.md` → `f5bdb0c6da59ac746cfddf925a09bccae6adfe24`,
equal to `git rev-parse phase-0-approved^{commit}` — the tagged commit is the one that added the
file ✅ (plan-notes 123). The Check originally read `git describe --tags --exact-match HEAD`, which
stopped passing with the next commit; replaced in `plan.md` §3 and explained in plan-notes 135.

Phase 1 had already run ahead of this gate on explicit owner instruction — recorded at the time as
an exception under §15.1 rather than as a reinterpretation of it. That exception is now moot.

---

## Phase 1 — Bootstrap and specifications ✅ COMPLETE (2026-08-29)

*`plan.md` §4. The locked `tsconfig.json` this phase produced stays in `plan.md` — it is normative
under §15.7 and changing it requires a plan edit.*

~~**Task 1.0 — Bootstrap the TypeScript workspace.**~~ ✅ Done. Highlights: npm name `stator` is taken → package **`statorc`**, binary stays **`stator`**, both pinned by a unit test (notes #1); `typescript` pinned **6.0.3** — npm `latest` is already 7.0.2/tsgo, which §0.3 bans; re-evaluate 2026-11-29 (notes #2); lint/format is **Biome** (one dev dep replacing ESLint's ~130; the four load-bearing rules at `error`; `noUnnecessaryConditions` off for a documented inference gap; notes #19); runtime archives build to separate `build/` and `build-asan/` trees so a sanitized object can never reach a release link (notes #7); the package manager is **pnpm 11.20.0** (`packageManager` pin) and `cpd` 5.0.16 gates duplication at 1% inside `pnpm run ci` (notes #20). The **locked `tsconfig.json`** it produced stays in `plan.md` §4 and remains normative (§15.7).

**Check — PASSED** (2026-08-29): `./ci.sh` green end to end (`pnpm install --frozen-lockfile && pnpm run ci` + the ASan runtime build); `node src/cli/main.ts --version` prints the version (pinned by a unit test); `make -C runtime` produces `runtime/build/libjsrt.a`. The literal "fresh clone" wording stays unverifiable until the initial commit exists — re-run it then.

~~**Task 1.1 — Write `docs/SUBSET.md`: the feature × mode matrix.**~~ ✅ Done — **`docs/SUBSET.md` is the sole authority for feature rows and their codes** (76 rows, grown from this plan's 26-row seed; the seed table is removed from here so it cannot drift — several of its placeholder codes were remapped when `DIAGNOSTICS.md` won the allocation collisions; notes #10/#11/#15/#17). The verdict vocabulary stays normative: **static** (compiled, unboxed hot path), **dynamic** (compiled via tagged values/shapes/ICs), **error(CODE)** (permanent, by design), **not-yet(CODE, phase)** (planned, diagnostic names the phase).

~~**Task 1.2 — Write `docs/MODES.md`.**~~ ✅ Done — includes the `explain --json` schema resolution (per-construct `constructs` array **plus** a derived file-level rollup, severity `error > not-yet > dynamic > static`; notes #12) and four contradictions found and fixed during reconciliation (1-indexed columns; per-construct codes; `Symbol` correctly a deferral, not permanent; `STA2001` reclassified as a *runtime* diagnostic; notes #13).

~~**Task 1.3 — Write `docs/DIAGNOSTICS.md`.**~~ ✅ Done — it is the **authoritative code allocator** (it wins every collision) and carries a "Retired codes" table: `STA1102` is retired (a not-yet code misfiled in the never range) and must never be reused (notes #10/#11). The range scheme stays as specified: `STA0xxx` CLI/config/toolchain; `STA10xx`/`STA11xx` "never" classes; `STA12xx` "not yet" (names the delivering phase); `STA2xxx` lowering/boundary (`STA2001` is a *runtime* class); `STA3xxx` module graph; `STA4xxx` internal errors (always a compiler bug).

~~**Task 1.4 — Decision tests + conventions.**~~ ✅ Done — **152 fixtures** (76 rows × 2 modes, identical slug sets) in `tests/subset/`; the runner also validates every `@code` against `DIAGNOSTICS.md` (retired codes fail — closes the hole where expected-fail fixtures are never otherwise executed; notes #14), and conditional "static if typed, else dynamic" rows follow the convention: the `ts` fixture takes the typed branch, the `js` fixture the untyped one (notes #16). The directive format lives in AGENTS.md → Testing rules.

**Check — PASSED** (2026-08-29): all three docs exist; 76 × 2 coverage holds by slug-set equality; `pnpm run test:subset` → `152 fixtures — 0 passed, 152 expected-fail, 0 failed`. All-expected-fail is the correct state until Phase 2 ships `explain`; **152 is the number to watch fall.**

---

## Phase 2 — Walking skeleton, end to end ✅ COMPLETE (2026-08-29)

*`plan.md` §5.*

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

## Phase 3 — Typed HIR and the lowering ladder ✅ COMPLETE (2026-08-30)

*`plan.md` §6.*

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

## Phase 4 — Runtime v1 — the landed tasks

*`plan.md` §7. **The phase is still open**: Task 4.2 (builtins) is in progress and its statement,
along with the phase Check, is still in `plan.md`. What follows is the evidence for the slices that
have landed.*

### Task 4.1 — Objects

✅ **Done.** The fixed-shape half landed with Phase 3 rung 6 (classes and literal layouts — a field read is an offset load, no IC). This task added the dynamic residue: `JSRTShape` transition chains off one root shape, `JSRTDynObject` with out-of-line doubling slot storage, and per-SITE `JSRTIC {shape, offset}` caches, filled only on hit — get-misses answer `undefined` and are never cached, and construction stores carry `NULL` caches because every one transitions (docs/VALUE.md §4.10, `runtime/src/jsrt_shape.c`, print corpus `print_shapes`). The frontend consumer: a literal whose CONTEXTUAL type (`getContextualType ?? getTypeAtLocation` — the annotation must win, since later reads go through it) has an optional property or index signature lowers to `DynObjectLiteral`, and property sites on such receivers to `DynFieldAccess`/`DynFieldAssignment`, all typed Unknown under verifier discipline `STA4059` (docs/HIR.md). Structural aliasing of a fixed object into a dynamic site aborts loudly at run time — `STA2004`, the third runtime-emitted diagnostic — rather than guess a slot (plan-notes 80). Check: `pnpm run ci` — 268 unit tests, subset 183 fixtures (112 passed / 71 expected-fail / 0 failed), golden 47/47 both runtimes, ASan/UBSan clean.

**Array-with-properties slice landed (2026-09-01), closing this task.** `JSRTArray` gained the
dynamic object's own property layout — `shape` + out-of-line `slots` + `slot_capacity`, with
`shape == NULL` meaning "no properties" so every ordinary array pays one NULL word and no
allocation — and `runtime/src/jsrt_shape.c` now drives a dynamic object and an array through ONE
`PropTable` view, so `m.index` resolves through the same shape chain and the same per-site inline
cache an `o.x` does (docs/VALUE.md §4.4). One thing needs this and it is not an optimization: a
RegExp match, which ECMA-262 §22.2.7.2 builds as an array of the capture groups carrying `index`,
`input` and `groups` as properties. `RegExp.prototype.exec` and `String.prototype.match` landed on
it, along with the print form Node uses — properties after the elements, no element grouping, and
`groups` printed as the NULL-PROTOTYPE object it is (`[Object: null prototype] { year: '2026' }`,
marked by a second class descriptor `jsrt_class_null_proto` that differs from `jsrt_class_dynamic`
by address alone). A capture that did not participate is `undefined` IN the array; `lastIndex`
moves exactly as `test` moves it, because exec and test are one algorithm with two answers; `match`
without `/g` IS exec and with `/g` answers the plain CreateArrayFromList list, or `null`.

The typing decision is recorded in full in plan-notes 120: the match's HIR type is **Unknown** and
its verdict `dynamic`, because `exec` answers a match OR null and the HIR has no union. Rather than
add `array` to `CHECKABLE` (which would silently widen every `unknown → T[]` narrowing in the
language) or give the match array an HType of its own, the surface follows the discipline every
other builtin follows: a closed table (`MATCH_FIELDS` — `index`, `input`, `groups`, `length`), one
HIR node (`MatchRead`, verifier `STA4089`), and the CHECKER as the proof that a receiver is a match
(`isMatchReceiver`, exactly as `isStringReceiver` proves a string). `m[0]` indexes it like the dense
array it is. Everything else on a match — `m.map`, `m.slice`, spreading it — is
`not-yet(STA1214, Phase 5)`, the union work. Check: `pnpm run ci` — 297 unit tests, 257 subset
fixtures (192 passed / 65 expected-fail / 0 failed), 85 golden fixtures both modes, runtime print
corpus matches Node, ASan/UBSan clean; `pnpm run test:builtins` 154/196 with `String.prototype`
31/32.

### Task 4.2 — Builtins (in progress; these slices landed)

**In progress — Math slice landed (2026-08-30).** The dashboard exists and runs in CI (`tests/golden/builtins_coverage.json` + `pnpm run test:builtins`, which verifies every claim: fixture exists AND mentions the member). Math's exactly-specified operations are done — `abs ceil floor round sign trunc sqrt pow min max`, all 8 constants, plus the `NaN`/`Infinity` globals — as one `MathCall` HIR node (CollectionOp precedent, `STA4080` verifier discipline) and one ECMA-exact C function each in `runtime/src/jsrt_math.c`; constants fold to the pinned Node's own doubles at lowering (plan-notes 81). The approximated transcendentals (`sin`, `log`, `exp`, `random`, …) are deliberately deferred until fdlibm is vendored — golden tests are byte-for-byte against Node, whose answers come from V8's fdlibm, not the host libm.

**Math transcendental slice landed (2026-09-01).** Vendored fdlibm now backs the remaining
transcendental wrappers, while `hypot` uses V8-compatible scaled binary arithmetic and `Math.random`
uses the determinism carve-out with a range/distribution proof. The new `tests/golden/ts/math_transcendental.ts`
fixture matches Node byte-for-byte. Dashboard coverage is **Math 42/42**, with `Math.random` carved
out as nondeterministic (overall **152/196** deterministic surface members). Full Phase 4 remains
open for Object, Date, console, and RegExp array-properties.
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

**RegExp data properties landed (2026-09-01), closing everything this phase owns on
`RegExp.prototype`.** The eleven properties of §22.2.6 plus `toString`, on a `REGEXP_FIELDS` table
beside the `REGEXP_OPS` method table — two closed tables rather than one, because `toString` and
`source` are both arity 0 and a single table could not tell the call from the read without a `form`
discriminant, which is two tables wearing one name. Every property is DERIVED, so nothing became
state the compiler has to keep in step: `source` and `flags` are two strings on `JSRTRegExp`,
`lastIndex` is a header field, and the eight flag predicates are one bit test against `lre_flags`
each — passed the flag's LETTER, because the `LRE_FLAG_*` constants belong to the vendored engine's
header and generated C does not include it. One HIR node (`regexp-read`) and one verifier code
(**STA4090**), the `MatchRead` shape with the receiver pinned the other way: a regexp is concretely
typed, so the verifier pins the receiver as it does a `RegExpOp`'s, where a match read must pin it
Unknown. The slice found a live output bug: `re->flags` stored the flag string AS WRITTEN, while
§22.2.6.4 orders it `d g i m s u v y` and Node normalizes everywhere — `console.log(/a/ig)` prints
`/a/gi`. Fixed at the single place that can fix it, `jsrt_regexp_new`, so `flags`, `toString` and
`inspect` read one normalized string and cannot drift. Three members deliberately stay out, each
for a different reason (plan-notes 121): `lastIndex` as a WRITE (an assignment target, which the
assignment gate admits only for a field of a class — refused by name rather than lowered into a
store), `unicodeSets` (declared in lib.es2024, unreachable while `tsconfig.json` pins
`lib: ["es2023"]`), and `compile` (Annex B §B.2.4 legacy with an optional second argument a
fixed-arity table cannot express). Dashboard: `RegExp.prototype` 2/15 → **13/15**, total
154/196 → **165/196**.

**`Date` slice A landed (2026-09-01) — the TZ-independent core.** Plan §7 Task 4.2's Date steps
1-7. A Date is one `double` on the heap behind a `jsrt_class_date` descriptor (`docs/VALUE.md`
§4.11) — the `JSRTRegExp` layout with a number where the pattern strings were, so it prefix-shares
`const JSRTClass *cls` with `JSRTObject`, adds no GC edges, and `jsrt_is_date` is a pointer
comparison. Three HIR nodes on the closed-table discipline: `DateOp` over `DATE_OPS` (22 members),
`DateStaticCall` over `DATE_STATICS` (`UTC`, `parse`, `now`), and `DateNew`, with verifier code
**STA4092** and runtime contract **STA4093**. `DATE_OPS` writes each C name out explicitly rather
than deriving it, because the mechanical camelCase→snake_case rule the string ops use turns
`getUTCFullYear` into `get_u_t_c_full_year`.

The landed surface: `new Date(ms | isoString | date)` and `new Date()`; `getTime`/`valueOf`/
`setTime`; the 8 `getUTC*` getters; the 7 `setUTC*` setters; `toISOString`/`toJSON`/`toUTCString`;
`Date.UTC` (1-7 args, spec defaults filled at lower time so the runtime entry stays fixed-arity);
ISO-only `Date.parse`; `Date.now`. Calendar arithmetic is Hinnant's `days_from_civil`/
`civil_from_days` over the proleptic Gregorian calendar §21.4.1 defines, validated against Node by
its own runtime corpus (`runtime/tests/print_dates.{c,mjs}`) BEFORE the compiler was touched — pre-
epoch flooring, the 1900/2000 leap exceptions, TimeClip at ±8.64e15, expanded ±6-digit years,
rolling setters, §21.4.4.21's Invalid-Date recovery for `setUTCFullYear` alone, and `toJSON`'s
`null`.

`new Date()` needed no node of its own: §21.4.2.1 step 2 defines it as the current time value, so
the lowering desugars it to `new Date(Date.now())`, which keeps `date-new` in the four switch arms
it shares with `json-parse` and costs the HIR nothing. It is a desugaring and not padding because
`new Date(undefined)` is an Invalid Date — an absent argument and an explicit `undefined` are
different programs. `Date.now` and the zero-argument constructor are ACCEPTED rather than deferred:
nondeterminism is a proof problem, not an acceptance problem, and they prove through the
determinism carve-out (`tests/unit/date-clock.test.ts` — wall-clock era, whole milliseconds,
monotonicity, real advance across ~3M iterations, and the desugaring bracketed by two readings of
the same clock).

Three documented ceilings, each recorded rather than worked around: `Date.parse` is ISO-only (Node's
non-ISO heuristics are TZ-dependent and implementation-defined, so a golden over one would pin this
machine); `toISOString` on an Invalid Date aborts where §21.4.4.36 throws a `RangeError`, the
`Object.freeze` ceiling exactly, until Phase 5 step 11; and `toJSON` answers `null` for an Invalid
Date though `lib.es5.d.ts` declares it `(): string` — §21.4.4.37 and Node both say `null`, which is
what makes `JSON.stringify(new Date(NaN))` the string `"null"`. `STA1210` became a RESIDUE code
(the `STA1211` shape) naming one member at a time: slice B (local time, blocked on the golden
runner's `TZ` pin) and the `toString`/`toLocale*` family (ICU CLDR data). Full record and the four
places the tree corrected the plan's steps: plan-notes 132. Dashboard: `Date` **3/3** (2 + 1
carved), `Date.prototype` **21/43**, total 165/196 → **190/239 (79%)**.

**Task 4.2 — `Date` slice B landed (2026-09-01).** The local-time half, plus `toDateString`. The
whole slice rests on one identity, §21.4.1.7's `LocalTime(t) = t + LocalTZA(t)`, with the offset
read from libc `localtime_r` at call time — the runtime carries no zone rules of its own and caches
nothing about the host zone in the object, so `tm_gmtoff` is the only tzdb question it asks. The 8
local getters were generated from the existing `DATE_GETTER` macro by adding one `local` flag to it
rather than hand-writing eight near-copies, and the 14 setters (7 UTC + 7 local) were collapsed the
same way into four shape macros over `set_fields(…, bool local)` — written out by hand that is
~120 lines in which the two halves could silently drift, and it would have breached the 1%
duplication gate besides.

The one thing that is genuinely hard here is the INVERSE. `local_time` is a function; its inverse
is not, because a wall-clock reading inside a DST gap names no instant and one inside a fold names
two. The first implementation used a single probe (`offset_at(local)`, correct once, then retry)
and got the fold wrong: on 2024-10-27 in Berlin, 02:30 local happens at 00:30Z under CEST and again
at 01:30Z under CET, and Node answers the first. §21.4.1.26 says why — both the gap and the fold
resolve to the offset in effect BEFORE the transition, which for the fold is the earlier instant.
The fix probes the offset one day either side (the spec's own window: its `before` is `t - 1 day`),
builds both candidate instants, and takes the first whose own offset validates it; when neither
does — the gap — the pre-transition offset settles it. Verified against the pinned Node in seven
zones covering DST both hemispheres, a 45-minute offset and a no-DST half-hour zone
(`UTC`, `Europe/Berlin`, `America/New_York`, `Australia/Lord_Howe`, `Asia/Kolkata`,
`Pacific/Chatham`, `America/Sao_Paulo`): byte-identical in all seven.

**The proof split is the point of the slice.** The golden runner now pins `TZ=UTC` via one
`PINNED_ENV` on all three `spawnSync` calls — the compiled binary AND the Node ground truth. UTC is
chosen deliberately over a zone that would make the fixtures distinguish local from UTC: the binary
reads the tzdb through libc while Node reads it through ICU, and for any real zone a tzdata skew
between the two surfaces as a byte diff that looks exactly like a semantics bug and is not. Under
that pin `tests/golden/{ts,js}/date_local.{ts,js}` prove the wiring end to end and the calendar
arithmetic, and every zone-dependent claim moves to `tests/unit/date-local.test.ts`, which names its
own `TZ` per case (Berlin for DST, Kolkata for the half-hour control) and asserts against dates
whose rules have been settled since 1996. `compileAndRunStreams`/`compileAndRunLines` gained an
optional `tz` that pins the RUN only; the build reads no clock and no tzdb.

`new Date(y, m, …)` became its own HIR node, `date-components`, rather than a discriminant on
`DateNew`: the two have different shapes (one value versus seven padded components), and a
`form` flag would have forced `arg` optional across five shared switch arms that all destructure it.
As a separate node it joined the existing N-argument family beside `date-static` and cost one arm
each in the verifier, the rewriter, `explain`, and the two emitter passes.

**Two things the tree corrected in the plan** (plan-notes 133). First, `toDateString` was listed
with the ICU family in `SUBSET.md`, `DIAGNOSTICS.md` and the exit criterion — wrongly: its output is
`Mon Jul 15 2024`, with no zone name in it, so it landed here. Its siblings `toString` and
`toTimeString` genuinely are ICU-blocked, and now for a MEASURED reason rather than an assumed one:
Node prints `(Central European Summer Time)` where libc's `%Z` gives `CEST`. Second, slice A's
`toUTCString` padded a negative year to six digits on the strength of a comment that no fixture
contradicted; Node pads it to four (`Fri, 01 Jan -0001 00:00:00 GMT`) and only `toISOString`'s
expanded-year form uses six. The new fixture has a negative year in it, which is how this surfaced.

Residue under `STA1210` is now exactly five members, all ICU-dependent: `toString`, `toTimeString`
and the three `toLocale*`, plus the call form `Date()`. Nothing time-zone-dependent remains, which
is what Date step 9 asked for. Dashboard: **207/238 (87%) +5 nondeterministic**, `Date` 3/3,
`Date.prototype` **38/43**.

### Task 4.3 — RegExp

**Task 4.3 landed (2026-08-30).** `libregexp` (+ `libunicode`, `cutils`) is vendored from quickjs-ng `v0.16.2` into `runtime/vendor/quickjs-ng/`, recorded in its own `VENDOR.md`, and compiled with `-Wall` alone rather than this repo's `-Wall -Wextra -Werror`: upstream code is not ours to fix, and a warning flag is not a correctness flag (plan-notes 101). The engine asks its embedder for exactly three functions — an allocator, a stack-depth question and a timeout question — and `runtime/src/jsrt_regexp.c` is the whole bridge. Two facts about that bridge were read out of the engine rather than assumed: `lre_compile` takes UTF-8, or CESU-8 when the pattern is not a unicode one (a lone surrogate is legal in a non-unicode pattern and has no UTF-8 encoding), and the capture array must be sized by `lre_get_alloc_count`, NOT by twice the capture count — the executor spills its own registers into the same array, and upstream's comment records the heap overflow that taught it. The subject needs no conversion at all: our strings ARE UTF-16 code units, which is `cbuf_type` 1, and the engine promotes that to 2 by itself for a unicode pattern. Above the C boundary, `RegExpLiteral` and `RegExpOp` joined the HIR on the `StringOp` table discipline (`REGEXP_OPS`, verifier `STA4086`): the pattern and the flags travel as TEXT, so nothing in this compiler parses them and nothing in it can disagree with the engine, and the literal is compiled at EVERY evaluation rather than hoisted — §22.2.4.1 makes each evaluation a fresh object, and it has to be, because `lastIndex` is mutable state on it (plan-notes 102). `test` is the landed surface; `exec` and the non-global `match` stay under `STA1211` because they answer an array WITH properties and a jsrt array is dense with no property table, and `new RegExp(...)` stays deferred because a pattern that is not in the source is a pattern the compiler cannot see. Dashboard: **123/186 (66%)**, `RegExp.prototype` at 1/15 — the denominator grew by the whole prototype, which is the dashboard's rule (plan-notes 95). Next on this task's own ground: the RegExp-taking `String.prototype` methods.

**Task 4.3, second slice (2026-08-30): the regexp-taking String methods.** `search` joined `STRING_OPS`, and `split`/`replace`/`replaceAll` gained their regexp forms — as the SAME op node, not new ones: the runtime dispatches on the pattern's TAG, because a regexp pattern is a scan and a string one is a substring search, and nothing above the C boundary needs to know which. The algorithms live in `jsrt_regexp.c` rather than `jsrt_string_ops.c` because all three are the engine's: one `scan()` collects every match's group offsets in a single pass, and search/split/replace are three readings of that list. Three spec details were settled against Node rather than guessed (plan-notes 103): `@@split`'s loop runs `while q < size`, so a match starting AT the end of the subject is never attempted — which is the whole reason `'abc'.split(/(?:)/)` is three elements and not four, and the golden fixture caught the fourth; `@@split`'s splitter is STICKY, so a failed attempt retries one position later rather than ending the scan, which is the one place the two loops the spec writes actually differ; and `$n` substitution caps at the pattern's group count, so `$1` in a groupless pattern stays literal. `search` never leaves `lastIndex` behind (§22.2.5.9 saves and restores it) while `replace` follows RegExpBuiltinExec's rule — a cursor is read and written only by a `/g` or `/y` pattern. `replaceAll` with a non-global pattern aborts loudly (the spec throws TypeError). Deferred, with a shared reason: `match`/`matchAll` answer an array WITH properties, `exec`'s blocker, and a replacer FUNCTION runs user code per match. Dashboard: **124/186 (67%)**, `String.prototype` at 26/32.

**Task 4.3, third slice (2026-08-30): libunicode pays a debt.** Vendoring libregexp brought libunicode with it, and the tables it needs for case folding are the same ones `toUpperCase`, `toLowerCase` and `normalize` need. Until now case mapping above ASCII ABORTED (`STA2005`) rather than answer wrongly — an honest placeholder for legal source, and one this slice retires. `runtime/src/jsrt_unicode.c` is the bridge, and it works in code POINTS rather than code units, because neither operation can be expressed as a per-unit walk: one code point can map to three (`ß` → `SS`, `ﬃ` → `FFI`), an astral character is one code point across two units, and `normalize` reorders and composes. The one context-dependent rule ECMA-262 keeps came with it — Final_Sigma, where `Σ` lowercases to `ς` at the end of a word and to `σ` inside one — implemented on `lre_is_cased`/`lre_is_case_ignorable`, which is the only reason libunicode exports them (plan-notes 104). `normalize` joined `STRING_OPS` at arity 1: an absent form means NFC, so the padding rule holds for one more op, and a form that is not one of the four aborts loudly (the spec throws RangeError). An ASCII string still takes the old per-unit path — it cannot change shape, so decoding it would buy nothing. Dashboard: **125/186 (67%)**, `String.prototype` at 27/32, and the residue is now exactly two families: `match`/`matchAll` (an array with properties, `exec`'s blocker) and `localeCompare`/`toLocale*`, which are collation and TAILORED casing rather than Unicode's own tables — Task 4.4's question, handed to it cleanly.

### Task 4.4 — Intl/ICU

**Task 4.4 landed (2026-08-30).** The three members `String.prototype` was still missing for a reason that was not scheduling: `localeCompare`, `toLocaleUpperCase` and `toLocaleLowerCase`. Unicode's own tables — the ones Task 4.3's third slice vendored — cannot answer either question. Collation is a per-locale ORDER (`'ä'` is an A with an accent in German and a letter after Z in Swedish) and tailored casing a per-locale EXCEPTION to the default mapping (`'i'` uppercases to `'İ'` in Turkish); both are CLDR data. They joined `STRING_OPS` like every other op, so the gate, the lowering, the verifier and the emitter needed no case of their own — the whole task is a build flag, a gate rule, and `runtime/src/jsrt_intl.c` over `ucol_strcoll`/`u_strToUpper`/`u_strToLower`. Three decisions carry it: the ICU objects live in their OWN directory, because `make` can see a stale timestamp but never a stale `-DJSRT_HAVE_ICU`; the link flags are written next to the archive by the build that produced it and read back by the CLI, so the two cannot disagree about which ICU this is; and the locale argument is REQUIRED even with the flag on, because the spec's absent-locales form reads the host's default and a compiled program whose output depends on the machine that runs it is not one this repo can golden-test. Without the flag the gate refuses all three under the new **STA1215**, which names the flag rather than a phase. `pnpm run ci` stays ICU-free and green (79 golden fixtures); `pnpm run test:intl` builds the feature runtime and runs 81, the two extra being `intl_locale.{ts,js}` — Turkish casing, Swedish and German collation, and Greek final sigma, all byte-for-byte against the pinned Node, which bundles the same ICU 78.3 / Unicode 17.0. Dashboard: **128/186 (69%)**, `String.prototype` at 30/32, and its residue is now exactly `match`/`matchAll` — the array WITH properties that also blocks `exec`, and no longer a data question at all.

### Task 4.5 — GC hygiene tests

**Task 4.5 landed (2026-08-30).** Both halves, and each found something the other could not have.

The **leak test** (`tests/leak/`, `pnpm run test:leak`, in `ci`) compiles the 10M-object loop and samples the process's RSS from `ps` — not from a counter the runtime keeps, which would be the runtime grading its own homework. It asserts a PLATEAU, never a figure: a peak inside a bound no non-collecting run could meet, and a tail that does not keep climbing. Measured both ways on this machine: **3056 KB flat with Boehm, 284 MB and still rising without it**, so the 64 MB cap separates the outcomes by a factor of five. Running it at all required installing `bdw-gc`, and that instantly turned all 79 golden fixtures red — `src/cli/build.ts` had never passed `-lgc`, because no machine this repo had run on had Boehm and the fallback was the only path ever taken (plan-notes 106). The fix generalised Task 4.4's mechanism: every build now records its link flags next to the archive it produced, and the CLI reads them back for every flavour.

The **frame audit** (`tests/unit/frames.test.ts`) emits the C for every standalone golden fixture and holds each function to four invariants: no `JSRT_LOCAL(i)` outside its own frame (the one failure here that is memory corruption rather than waste), a frame exactly as large as the slots written into it, a globals frame exactly as large as the globals used, and a `JSRT_FRAME_POP()` on every path out — every `return` and the fallthrough. It failed on three over-allocations the moment it was written, all of them the counting pass reserving storage the emitter had a better home for: a CAPTURED local that already lived in the heap environment, an unconditional return slot in functions that never return a value, and a scratch slot claimed by `{}` for an entry it does not have (plan-notes 107). One reservation stays conservative and is counted as an allowance rather than pretended away: a `try`/`finally`'s exception stash, whose need is decided while emitting the try body, long after `JSRT_FRAME(n)` had to be final.

Neither test can see what the other sees. The audit proves the emitted C declares the slots it writes; only the leak test can tell a runtime that collects from one that never frees, because both print the same number.

Neither could see the third thing, and it was the one that mattered: **the collector could not see a single reference the runtime held.** Boehm is conservative — it retains what looks like a heap address — and a NaN-boxed `jsrt_value` never does, because the tag sits above bit 48. Every object reachable only through a boxed reference (a Map's entries, an array's elements, an object slot, a `JSRT_LOCAL`) was collectible while live; a probe holding a 200-entry Map across a forced collection SIGSEGV'd, and the reason no test had ever said so is that every fixture allocated too little to reach Boehm's first collection. `bdw-gc 8.2.12` predates `GC_set_pointer_mask`, so the fix unboxes explicitly at both places a reference hides, in the new `runtime/src/jsrt_gc.c`: a custom object kind whose mark procedure masks every word it scans, and a `GC_set_push_other_roots` walk of the `JSRT_FRAME` shadow stack — the first thing that has ever READ those frames. Consolidating all fourteen collected allocations behind one `jsrt_gc_alloc` is what makes "the whole heap" a fact rather than a hope (plan-notes 108). The same reasoning found a second invisible cell — `jsrt_throw`'s pending-exception mailbox, static storage holding the only reference to a value while the `finally` blocks on the way out allocate — whose rooting invariant jsrt_value.h had written down and nothing had implemented. `tests/golden/ts/gc_reachability.ts` is the standing check, and its heap half is provably not vacuous: with the hooks removed it is the suite's one failure, a SIGSEGV. Its unwind half is not — it passes with the exception root removed too, because at `-O2` the thrown value survives in a register the collector happens to scan, and plan-notes 108 says so rather than banking the coverage.

### Task 4.6 — `async`/`await` (generators deferred to Phase 5)

**Task 4.6 landed (2026-08-30), async half only.** `async`/`await` works; generators do not, and the two were split apart rather than shipped together, because the state machine is only half of what a generator needs — the other half is the iterator protocol, and a `yield` answers its caller where an `await` answers a scheduler. Generators keep their own subset rows and stay not-yet under **STA1201** — which now names **Phase 5** rather than the phase closing here, because what they still need is the iterator protocol, and that is the same blocker holding `for-of` and the `keys`/`values`/`entries` triple that `Array`/`Map`/`Set` are each missing. Four surfaces, one owner: Phase 5 step 8 (plan-notes 112).

The decision the whole task rests on: **a reaction is a native continuation** — a C function plus GC-allocated state — not a JS callback. An async function's resume point and `Promise.all`'s per-element handler are the same kind of thing, so one mechanism (`jsrt_promise_subscribe`) serves both and neither needs `.then` to exist. That is why the deferred list reads oddly: `Promise.resolve`/`reject`/`all` are implemented while `.then` is not. `.then` is not the foundation here, it is a future *client* of it — a reaction whose state is the JS handler and the derived promise — and what blocks it is that a handler's throw must become a rejection, which needs a runtime-level catch around user code (**STA1216**, Phase 5, along with `new Promise(executor)` for the same reason).

Two rules carry ordering, which is the part of a promise implementation that is easy to get subtly wrong and observable when you do: a reaction is always QUEUED and never run inline, even when the promise it subscribes to has already settled; and reactions run in registration order. `jsrt_await` subscribes to `jsrt_promise_resolve(operand)`, so awaiting a non-promise still costs exactly one tick — which is what makes an interleaving match Node's rather than merely finishing with the same answer. The event loop is `jsrt_run_microtasks()` and nothing more: no timers, no I/O, so no macrotask phase and no libuv.

In codegen an async unit is **two C functions**. The entry point keeps the closure ABI, builds the heap environment that outlives every suspension, and hands it to `jsrt_async_start`, which runs the body's prefix synchronously on the caller's stack (observable, and the difference between an async function and a callback). The resume function holds the body: each `await` parks a state number, subscribes, pops the frame and returns; each resumption rebuilds the frame and jumps to the suspension point. **Nothing lives in the C frame across a suspension** — every local of an async unit is addressed as `_jsrt_env->slots[i]` — and that is precisely what makes a `goto` into the middle of a loop or a `try` block correct rather than a hazard.

Unhandled rejections are counted at settle and checked **after** the drain, not at the rejection: a promise rejected now is routinely awaited by a continuation still sitting in the queue, and only an empty queue settles the question. The check then aborts with the `STA2005` pattern rather than swallowing, because matching Node's report byte-for-byte means an `Error` object with a stack this runtime does not build yet — and silently discarding a rejection is the one outcome that would be wrong without saying so.

Ground truth comes in a pair, `runtime/tests/print_promise.{c,mjs}`: the same promises, the same subscriptions, the same order, expressed as native continuations on one side and `.then` on the other. That is the only way this file can assert anything about ORDER — an implementation cannot check its own tick count against itself. The golden half is `{ts,js}/async_await.{ts,js}`: interleaved starts, a three-deep await chain, a throw in an async body caught by an awaiting `try`, and `Promise.all` proving input order survives out-of-order settling plus first-rejection-wins. The js fixture prints its `Promise.all` result whole rather than indexed, because without an annotation the checker calls it a tuple and indexing one is a property access the js tier does not have yet (STA1214) — the claim under test is order, and printing the array whole makes it.

Auditing the emitted diagnostics against `docs/DIAGNOSTICS.md` found four codes with no table row, and one of them was worse than missing: top-level await had been renumbered from the allocated **STA1208** to a fresh code, which the sole-allocator rule exists to prevent. Restored, and the Promise-callback code renumbered down to keep the band contiguous (plan-notes 110). Top-level await and `import()` moved from Phase 4 to Phase 7 in `docs/SUBSET.md`, where the module work actually lives. `pnpm run ci` is green end to end: 290 unit tests, 253 subset fixtures (188 passed, 65 expected-fail, 0 failed), 82 golden fixtures, the print corpus byte-for-byte against Node under both `-O2` and ASan/UBSan, and the leak test at 3072 KB of a 65536 KB cap. Dashboard: **131/197 (66%)** — down from 69%, because `Promise` and `Promise.prototype` joined the surface with their combinators empty, and a namespace that grows the denominator honestly is the point of the dashboard (plan-notes 95).
