# Contributing

Repository prose is English. Read [`AGENTS.md`](AGENTS.md) before changing
anything — conventions, package layout, and how diagnostics / subset decisions
are allocated.

## Setup

Pinned toolchain: [`.node-version`](.node-version) and [`mise.toml`](mise.toml).
Full table: [`docs/TOOLCHAIN.md`](docs/TOOLCHAIN.md).

```
mise install
pnpm install --frozen-lockfile
just -f packages/runtime/justfile -d packages/runtime runtime
```

## Checks

```
pnpm run ci
```

Dev runs the compiler from TypeScript on the pinned Node — no `pnpm run build`
step for everyday CLI use. Spec docs live under [`docs/`](docs/); getting
started is the [project README](README.md).
