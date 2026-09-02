# Stator

An ahead-of-time compiler from TypeScript and JavaScript to native binaries.

Typed code compiles to unboxed machine values. Untyped code compiles too — through a dynamic representation (NaN-boxed values, shape tables, inline caches) — instead of being rejected or heroically analyzed. One pipeline; the mode is a policy layer on top.

This is a research compiler under active construction (Phase 5 of [`plan.md`](plan.md)). It is not an npm-ecosystem drop-in, and it is not a production JS runtime.

## Two modes

| | `--mode=ts` (default) | `--mode=js` |
|---|---|---|
| Inputs | `.ts` only | `.js` and `.ts` mixed |
| `any`, `eval`, `var`, `Proxy` | compile errors, permanently | untyped code is dynamic; `eval` is not-yet until Phase 8 |
| Speed | unboxed values inside checked code | same, wherever the checker can infer a type |

```
node src/cli/main.ts build app.ts -o app
node src/cli/main.ts build app.js -o app --mode=js
node src/cli/main.ts explain app.ts --json
```

`explain` reports per-construct verdicts: `static`, `dynamic`, `error`, or `not-yet`. Decision tests in `tests/subset/` are that matrix.

## Requirements

Pinned in [`.node-version`](.node-version) and [`mise.toml`](mise.toml): Node 26.7.0, pnpm 11.20.0, LLVM clang 21.1.8, just 1.58.0. Full table: [`docs/TOOLCHAIN.md`](docs/TOOLCHAIN.md).

```
mise install
pnpm install --frozen-lockfile
just runtime
```

Boehm GC is optional (`pkg-config bdw-gc`); without it the runtime still builds, with a bump allocator. ICU is a separate `just runtime-intl` feature build.

## Commands

```
pnpm run ci              # typecheck, lint, dupes, coverage, subset, golden, sanitizers, leak
pnpm run test            # unit tests
pnpm run test:subset     # feature × mode decision matrix
pnpm run test:golden     # compile + run vs the pinned Node, byte-for-byte
pnpm run test262         # Test262 slice (CI heartbeat; corpus fetched separately)
pnpm run differential    # fuzzer vs Node
just runtime             # libjsrt.a (clang -O2 -Werror; thin LTO where the linker can read it)
just runtime-asan        # ASan/UBSan archive
```

Dev runs TypeScript directly on the pinned Node — no `pnpm run build` step for the CLI. GitHub Actions runs `pnpm run ci` plus a Test262 heartbeat on every push; nightly fuzz and weekly benches are `.github/workflows/nightly.yml`.

## Docs

| | |
|---|---|
| [docs/README.md](docs/README.md) | index of the spec docs |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | pipeline diagrams (D2) |
| [docs/MODES.md](docs/MODES.md) | `ts` vs `js` |
| [docs/SUBSET.md](docs/SUBSET.md) | what compiles, what is error, what is not-yet |
| [docs/VALUE.md](docs/VALUE.md) | NaN-boxing, shapes, GC rooting |
| [plan.md](plan.md) | roadmap (open work only) |
| [AGENTS.md](AGENTS.md) | conventions for humans and agents working in this repo |

## License

MIT
