# Stator niche decision — explicit static/dynamic policy for tooling binaries

**Status: ✅ APPROVED** by the repository owner (Ivan Tugay) on 2026-09-01, by name — "Approve
Stator niche decision — explicit static/dynamic policy for tooling binaries", this document's own
title. Phase 0's gate is closed and the commit carrying this file is tagged `phase-0-approved`
(plan.md §3 Task 0.1 step 5).

The approval is of the niche AS WRITTEN below, including its two disqualifiers: extensible end-user
scripting is not this project's problem, and scriptc is to be re-evaluated quarterly. Reopening
this decision needs the §15.4 bar — new measured evidence, recorded in `plan-notes.md` — not a
change of mind.

## Chosen niche

Stator targets **small, standalone developer-tool and worker binaries that are
gradually migrated from existing JavaScript to strict TypeScript**.  Its product
contract is an explicit two-mode policy over one module graph:

- `--mode=ts` is a deliberately strict, fully typed compilation mode.  It
  rejects `any` and the closed set of dynamic escape hatches rather than
  silently introducing a slow or unsound path.
- `--mode=js` accepts mixed TypeScript and JavaScript and marks only the
  untyped residue dynamic.  Every JavaScript-to-typed-TypeScript boundary is
  checked at runtime, and `stator explain --json` reports which constructs
  stayed static and which became dynamic.

The intended use is not arbitrary npm compatibility or user scripting.  It is
an adoption path for codebases whose hot/tooling path can become typed while
legacy JavaScript remains visible, auditable, and safely boxed at its
boundaries.  If the actual requirement is extensible end-user scripting,
embedding QuickJS-NG (or using a WASM plugin system) is the lower-risk choice
and Stator should not be used.

## Competitor that almost serves it

[scriptc](https://github.com/vercel-labs/scriptc) is the closest competitor.
It compiles TypeScript and JavaScript to native artifacts using the TypeScript
compiler, emits C/LLVM/native outputs, and explicitly offers a QuickJS-NG
dynamic fallback for code that cannot compile statically.  It is therefore a
credible alternative for plain TypeScript-to-native tooling binaries and must
be re-evaluated every quarter before further investment.

Stator's proposed differentiator is narrower than “TypeScript to native”:
scriptc's public contract is construct-level static compilation with an
explicit embedded-engine fallback, whereas Stator is designed around two
auditable source-policy modes in the *same module graph*, with typed/dynamic
provenance carried through HIR and mandatory checks where dynamic JavaScript
enters typed TypeScript.  That difference needs owner validation with actual
prospective users; it is not a claim that scriptc cannot solve a nearby
problem.

## Evidence and current market check (2026-09-01)

- scriptc describes itself as experimental and documents both its TypeScript
  type-checking pipeline and its explicit QuickJS-NG dynamic fallback:
  [README](https://github.com/vercel-labs/scriptc#readme).
- [Perry](https://github.com/PerryTS/perry#readme) is a native
  TypeScript/JavaScript compiler, but its stated product focus is broad native
  and UI targets rather than this migration-policy contract.
- [Porffor](https://github.com/CanadaHonk/porffor#readme) is an experimental
  AOT JS/TS engine/compiler and says it is not intended for serious use; it
  parses type annotations but does not replace a full type checker.
- [Hermes](https://github.com/facebook/hermes#readme) is a React Native
  JavaScript engine using AOT bytecode/static optimization, not a
  standalone-native-binary compiler for this niche.

These are product self-descriptions, not performance measurements.  No
competitor benchmark number is used as evidence here.

## Phase-0 decision requested

Approve only if this narrowly defined, audited TS/JS migration path is a real
user need that is not adequately served by adopting scriptc or embedding an
engine.  On approval, commit this file and tag that commit
`phase-0-approved`; on rejection, stop compiler feature work and pivot to the
chosen alternative.
