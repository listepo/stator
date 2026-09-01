# TOOLCHAIN.md

The pinned toolchain (plan.md §4 Task 1.0 step 2). Differential ground truth is the Node in
`.node-version` — **that Node and only that Node**. Record any change here in the same commit
that changes the pin, and note the reason in `plan-notes.md`.

## Pinned

| Tool | Pin | Where pinned |
|---|---|---|
| Node | `26.7.0` | `.node-version`, `engines.node >= 24` in `package.json` |
| TypeScript | `6.0.3` (exact) | `dependencies` in `package.json` |
| `@types/node` | `26.4.0` (exact) | `devDependencies` |
| Biome | `2.5.11` (exact) | `devDependencies` |
| cpd (copy/paste detector) | `5.0.16` (exact) | `devDependencies` |
| pnpm | `11.20.0` | `packageManager` in `package.json` |
| C compiler | `clang`, C11 | `runtime/Makefile` |

Node ≥ 24 is required because dev runs the compiler's TypeScript sources directly
(`node src/cli/main.ts`) via native type stripping — there is no build step in development.

TypeScript is deliberately **not** on `latest`: `latest` is now 7.x (the Go port / tsgo), whose
public compiler API plan.md §0.3 rules out. `6.0.3` is the newest stable 6.x. Re-evaluate
quarterly and record the outcome in `plan-notes.md`.

## Verified development host

The host this bootstrap was verified on (a data point, not a requirement):

```
node    v26.7.0
clang   Apple clang version 21.0.0 (clang-2100.1.1.101), arm64-apple-darwin25.5.0
make    GNU Make 3.81
git     2.50.1 (Apple Git-155)
os      Darwin 25.5.0 arm64
```

CI must run at least ubuntu-latest and macos-latest (plan.md §4 Task 1.0 step 10).

## Commands

```
pnpm install --frozen-lockfile   # install exactly the pinned tree
pnpm run ci                      # typecheck -> lint -> dupes -> unit -> runtime -> subset -> golden
make -C runtime       # runtime/build/libjsrt.a          (clang -O2, -Werror)
make -C runtime asan  # runtime/build-asan/libjsrt.a     (-fsanitize=address,undefined -O1 -g)
make -C runtime clean
./ci.sh               # what CI runs, locally
```

Release and sanitized runtime archives build into **separate** directories (`build/` and
`build-asan/`) so a sanitized archive can never be linked into a release binary by accident.

Release links dead-strip (Task 3.12): builtins live in `libjsrt.a` compiled with
`-ffunction-sections -fdata-sections`, and the final link passes `-Wl,-dead_strip` (Mach-O) or
`-Wl,--gc-sections` (ELF), so a builtin the program never references is not in the binary —
function granularity, not the archive's .o granularity. Sanitized builds skip the stripping:
ASan's global-registration sections are exactly what `--gc-sections` is documented to drop.

## Not yet required

These arrive with the phase that needs them; do not add them to CI before that:

- **Boehm GC (`bdw-gc`)** — Phase 2 Task 2.5. macOS: `brew install bdw-gc`;
  Debian/Ubuntu: `apt-get install libgc-dev`. Discovered via `pkg-config --libs bdw-gc`.
- **Ryū** — **NOT vendored.** Planned by Phase 2 Task 2.5 for `runtime/vendor/ryu/`; it was never fetched (no network access), and `shortest_digits()` in `runtime/src/jsrt_print.c` stands in for it with a round-trip search over `%.*e`. Correct, and slow: up to 18 `snprintf`+`strtod` pairs per number printed. See plan-notes 28 — this line claimed it was vendored until 2026-09-01.
- **QuickJS-NG `libregexp`** (`runtime/vendor/`) — Phase 4.
- **Test262 checkout** — Phase 6.
