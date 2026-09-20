# Docs

How stator is specified. [`plan.md`](../plan.md) is the authority for what is still open; these files operationalize it.

**Getting started:** [project README](../README.md) → [`HOW-IT-WORKS.md`](HOW-IT-WORKS.md). **Contributing:** [`CONTRIBUTING.md`](../CONTRIBUTING.md).

| File | What it is |
|---|---|
| [HOW-IT-WORKS.md](HOW-IT-WORKS.md) | Pipeline narrative + CLI and example walkthroughs (todo, FFI) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | D2 gallery: pipeline, `stator build`, packages, value boxing |
| [MODES.md](MODES.md) | `--mode=ts` vs `--mode=js`: file acceptance, diagnostics, mixed-graph boundaries |
| [SUBSET.md](SUBSET.md) | Feature × mode matrix (`static` / `dynamic` / `error` / `not-yet`) |
| [DIAGNOSTICS.md](DIAGNOSTICS.md) | Sole allocator of `STA` codes — never allocate a code anywhere else |
| [VALUE.md](VALUE.md) | Codegen↔runtime contract: NaN-boxing, shapes, ICs, GC frames |
| [NUMERIC.md](NUMERIC.md) | IEEE-754, Ryū printing, bitwise ToInt32, `**` |
| [HIR.md](HIR.md) | Typed IR: node kinds, HType, `Unknown`, verifier invariants |
| [TOOLCHAIN.md](TOOLCHAIN.md) | Pinned Node/pnpm/LLVM/just, commands, native libraries |
| [FFI.md](FFI.md) | Calling C from TS: extern surface, ABI table, ownership |
| [STD.md](STD.md) | DRAFT skeleton: `std` systems library, threads chapters live here at T10.2 |

Architecture **source** is D2 in [`architecture/`](architecture/), not Mermaid. Regenerating the SVGs is a docs-tool step (`brew install d2`), not part of `pnpm run ci`. Commands are in [ARCHITECTURE.md](ARCHITECTURE.md).
