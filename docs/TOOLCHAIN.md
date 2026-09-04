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
| pnpm | `11.20.0` | `packageManager` in `package.json`, `mise.toml` |
| LLVM | `21.1.8` | `mise.toml` (`conda:llvm` + `conda:clang`, Unix). The C compiler the justfile and `src/cli/build.ts` look up as `$CC`/`clang`. Conda prebuilts — the asdf llvm plugin compiles from source and is not the pin. |
| just | `1.58.0` | `mise.toml`. The runtime build (`just runtime`, `just runtime-asan`, `just runtime-intl`). |

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
just    1.58.0
git     2.50.1 (Apple Git-155)
os      Darwin 25.5.0 arm64
```

CI must run at least ubuntu-latest and macos-latest (plan.md §4 Task 1.0 step 10).

## Commands

```
pnpm install --frozen-lockfile   # install exactly the pinned tree
pnpm run ci                      # typecheck -> lint -> dupes -> unit+coverage -> runtime -> subset -> golden -> leak -> asan
pnpm run test                    # unit tests
pnpm run test:coverage           # unit tests + src/ coverage table; writes coverage/lcov.info
pnpm run test:subset             # feature × mode decision matrix
pnpm run test:golden             # compile + run vs the pinned Node, byte-for-byte
pnpm run test262                 # Test262 slice against the pin in tests/test262/pin.json
pnpm run differential            # fuzzer vs Node (failures land in tests/differential/failures/)
pnpm run bench:record            # refresh tests/bench/baseline.json (this machine only)
just runtime          # runtime/build/libjsrt.a          (clang -O2, -Werror; thin LTO where the linker allows)
just runtime-asan     # runtime/build-asan/libjsrt.a     (-fsanitize=address,undefined -O1 -g)
just runtime-intl     # runtime/build-intl/libjsrt.a     (ICU feature build)
just runtime-test     # print corpus vs Node
just runtime-clean
node src/cli/main.ts build file.ts -o app [--mode=ts|js]
node src/cli/main.ts explain file.ts --json
```

Release and sanitized runtime archives build into **separate** directories (`build/` and
`build-asan/`) so a sanitized archive can never be linked into a release binary by accident.

Release links dead-strip (Task 3.12): builtins live in `libjsrt.a` compiled with
`-ffunction-sections -fdata-sections`, and the final link passes `-Wl,-dead_strip` (Mach-O) or
`-Wl,--gc-sections` (ELF), so a builtin the program never references is not in the binary —
function granularity, not the archive's .o granularity. Sanitized builds skip the stripping:
ASan's global-registration sections are exactly what `--gc-sections` is documented to drop.

Release archives are thin-LTO bitcode where the toolchain can link one (plan-notes 162): `just
runtime` probes `-flto=thin` through `$CC`/`$AR` and records the flag in `build/link-flags.txt`, so
the CLI's single clang call compiles the generated C to bitcode too and the runtime's accessors and
builtins inline across the archive boundary. ld64 and lld read bitcode archives; GNU ld needs the
LLVMgold plugin, and without it the probe fails and the archive is plain objects, reported on the
recipe's status line. Sanitized builds never use LTO. A probe result or Boehm status that differs
from the last build rebuilds every object (`build*/cflags.txt`).

## Native libraries

None of these come from the npm tree. Vendored sources live in the repo and build with the runtime;
system libraries are discovered at `just runtime` time and recorded in `build*/link-flags.txt`, which
`src/cli/build.ts` reads back — so the emitted program links exactly what the archive it links was
compiled against (plan-notes 106).

| Library | Kind | Required | For | Discovery / install |
|---|---|---|---|---|
| QuickJS-NG `libregexp` (+ `libunicode`, `cutils.h`) | vendored, MIT | yes | the RegExp engine (golden rule 5) | `runtime/vendor/quickjs-ng/` — provenance in its `VENDOR.md` |
| fdlibm (V8 `ieee754.cc`, mechanically ported to C11) | vendored, fdlibm + BSD-3-Clause | yes | `Math.sin` and 19 siblings, bit-identical to the pinned Node's | `runtime/vendor/fdlibm/` — provenance in its `VENDOR.md` |
| libm (`-lm`) | system | yes | `floor`/`trunc`/`sqrt`/`fmod` — ToInt32, array indexing, the print path | part of libSystem on macOS (the flag is a no-op there), separate on glibc (plan-notes 122) |
| Boehm GC (`bdw-gc`) | system | optional | the collector (`docs/VALUE.md` §4.12); without it the runtime falls back to plain `malloc`, no collection | `pkg-config --libs bdw-gc`; macOS `brew install bdw-gc`, Debian `apt install libgc-dev` |
| ICU (`icu-uc`, `icu-i18n`) | system | optional, feature build only | `Intl` — `just runtime-intl`, into `build-intl/` | `pkg-config`; macOS `brew install icu4c`, Debian `apt install libicu-dev` |

The default archive is byte-identical whether or not ICU is installed on the host — that is why
Intl is a separate object directory rather than a flag on the default build.

Vendored code compiles with `-Wall` alone rather than the runtime's `-Wall -Wextra -Werror`
(plan-notes 101) and is never hand-edited. A version bump is `pnpm run vendor:update <name> [ref]`
(`runtime/vendor/update.mjs`): it refetches the manifest's files at that ref — re-running `port.mjs`
over upstream's `ieee754.cc` for fdlibm — and prints the provenance rows for the directory's
`VENDOR.md`. `--check` validates the manifests offline. Re-vendoring at the pinned ref reproduces
the tree byte-for-byte, so `git status` after a run is the diff the bump actually introduces.

## Native tools

Beyond Node/pnpm (pinned above), the build shells out to:

| Tool | Used by | For |
|---|---|---|
| `clang` (`$CC`) | justfile, `src/cli/build.ts` | the runtime, the emitted C, and the final link |
| `ar` (`$AR`) | justfile | archiving `libjsrt.a` |
| `just` | justfile | the runtime build (pinned `1.58.0` in `mise.toml`) |
| `pkg-config` | justfile | finding bdw-gc and ICU; absent means both are simply off |
| `diff` | `just runtime-test` | the print corpus against Node, byte-for-byte |

`clang` (and the rest of LLVM) is `mise install` on Unix. The other three still come from the Xcode
command-line tools (`xcode-select --install`) on macOS and from `binutils`/`pkg-config`/
`diffutils` on Debian/Ubuntu. A missing compiler is a diagnostic with the install hint (`STA0008`),
not a crash.

## Not yet required

These arrive with the phase that needs them; do not add them to CI before that:

- **Ryū** — **NOT vendored.** Planned by Phase 2 Task 2.5 for `runtime/vendor/ryu/`; it was never fetched, and `shortest_digits()` in `runtime/src/jsrt_print.c` stands in for it with a round-trip search over `%.*e`. Correct, and slow: up to 18 `snprintf`+`strtod` pairs per number printed. See plan-notes 28 for the standing seam and plan-notes 188 for the correction: the network IS reachable, so Ryū is fetchable and simply not yet fetched — a scheduling fact, not an environmental one. **The schedule is now recorded** (owner's call, 2026-09-04, plan-notes 190): Ryū rides the §12 optimization ladder rather than becoming a task, because the corpus it would replace already matches Node byte-for-byte, so it is a pure speed change and §12's entry criterion — a measured before/after on Task 6.3's harness — applies. (This line claimed Ryū was vendored until 2026-09-01.)
- **Test262 corpus** — fetched on demand (`pnpm run test262:fetch`) into `tests/test262/corpus/` or `$STATOR_TEST262`. The runner, pin, and ratchet are in-tree; `pnpm run test262` is a CI heartbeat, not part of `pnpm run ci`.
