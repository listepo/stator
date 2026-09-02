# Docs

How Stator is specified. [`plan.md`](../plan.md) is the authority for what is still open; these files operationalize it. Getting started is the [project README](../README.md).

| File | What it is |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | D2 gallery: pipeline, `stator build`, packages, value boxing |
| [MODES.md](MODES.md) | `--mode=ts` vs `--mode=js`: file acceptance, diagnostics, mixed-graph boundaries |
| [SUBSET.md](SUBSET.md) | Feature × mode matrix (`static` / `dynamic` / `error` / `not-yet`) |
| [DIAGNOSTICS.md](DIAGNOSTICS.md) | Sole allocator of `STA` codes — never allocate a code anywhere else |
| [VALUE.md](VALUE.md) | Codegen↔runtime contract: NaN-boxing, shapes, ICs, GC frames |
| [NUMERIC.md](NUMERIC.md) | IEEE-754, Ryū printing, bitwise ToInt32, `**` |
| [HIR.md](HIR.md) | Typed IR: node kinds, HType, `Unknown`, verifier invariants |
| [TOOLCHAIN.md](TOOLCHAIN.md) | Pinned Node/pnpm/LLVM/just, commands, native libraries |

Architecture **source** is D2 in [`architecture/`](architecture/), not Mermaid. Regenerating the SVGs is a docs-tool step (`brew install d2`), not part of `pnpm run ci`. Commands are in [ARCHITECTURE.md](ARCHITECTURE.md).
