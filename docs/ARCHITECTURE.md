# ARCHITECTURE.md — how Stator works (diagrams)

UML-style views of the pipeline defined in `plan.md` §2. That section is the authority; these
diagrams visualize it and may not contradict it. Mermaid renders natively on GitHub — no tooling.

## 1. Compile pipeline (component view)

One pipeline, two modes. Mode is a policy layer at the frontend gate; nothing below it knows the
mode existed (plan §0.8).

```mermaid
flowchart TD
    SRC["entry.ts / entry.js<br/>(+ module graph)"] --> TSC

    subgraph FRONTEND["src/frontend/ — the only place ts.Type may appear"]
        TSC["ts.createProgram<br/>(typescript npm pkg, in-process;<br/>Stator owns compilerOptions)"]
        TSC --> AST["ts.SourceFile ASTs"]
        TSC --> CHK["TypeChecker"]
        AST --> GATE
        CHK --> GATE["mode policy gate (ts | js)<br/>file acceptance · subset/mode diagnostics · verdicts"]
    end

    GATE --> LOWER["src/lower/ — TS AST → HIR"]

    subgraph MIDDLE["mode-blind middle end"]
        LOWER --> HIR["Typed HIR (src/hir/)<br/>every node carries an HType;<br/>Unknown is a first-class HType"]
        HIR --> PASSES["src/passes/: monomorphize · shape-resolve ·<br/>boundary-check insert · const-fold · DCE/tree-shake · inline<br/>(HIR verifier after each, debug builds)"]
    end

    PASSES --> EMIT["C emitter (src/codegen/)<br/>#line source maps · JSRT_FRAME rooting"]
    EMIT --> CLANG["clang -O2"]
    CLANG --> LINK["link runtime/build/libjsrt.a"]
    LINK --> BIN["native binary"]

    subgraph RUNTIME["runtime/ (C11)"]
        RT["NaN-boxed jsrt_value · Boehm GC (v0) →<br/>precise generational (§12) · builtins ·<br/>QuickJS-NG libregexp · shortest-round-trip dtoa"]
    end
    RT --> LINK
```

## 2. A `stator build` invocation (sequence view)

```mermaid
sequenceDiagram
    participant CLI as src/cli
    participant FE as src/frontend
    participant TS as typescript pkg
    participant LO as src/lower
    participant HIR as src/hir (verifier)
    participant PA as src/passes
    participant CG as src/codegen
    participant CC as clang

    CLI->>FE: build(entry, mode)
    FE->>TS: ts.createProgram(entry, locked compilerOptions)
    TS-->>FE: SourceFiles + TypeChecker
    FE->>FE: gate: accept files, apply mode policy,<br/>emit STA diagnostics / verdicts
    Note over FE: ts.Type → HType here; ts.Type never leaks past frontend
    FE->>LO: gated AST + HTypes
    LO->>HIR: typed HIR
    loop each pass
        PA->>HIR: transform
        HIR-->>PA: verify (debug builds)
    end
    PA->>CG: final HIR
    CG->>CC: C source (#line maps, JSRT_FRAME discipline)
    CC-->>CLI: object code, linked with libjsrt.a → native binary
```

Diagnostics short-circuit: any `STA` error at the gate stops the build with code + span + mode;
`stator explain` runs the same front half and reports per-construct verdicts
(`static | dynamic | error | not-yet`) instead of continuing to codegen.

## 3. Module dependencies (package view)

Arrows mean "imports from". The two structural invariants are the point of this diagram.

```mermaid
flowchart LR
    cli[src/cli] --> frontend[src/frontend]
    cli --> support[src/support<br/>diagnostics engine]
    frontend --> hir[src/hir<br/>HType + HIR + verifier]
    frontend --> support
    lower[src/lower] --> hir
    lower --> support
    passes[src/passes] --> hir
    codegen[src/codegen] --> hir
    codegen -. emits C against .-> jsrt["runtime/include/jsrt_value.h<br/>(mirrors docs/VALUE.md —<br/>the codegen↔runtime contract)"]

    tsp[typescript pkg] --> frontend
```

Invariants:
- **`ts.Type` stops at `src/frontend/`** — everything downstream speaks HType only.
- **Mode stops at the gate** — a pass or the emitter needing the mode means the design is wrong (plan §0.8).
- Generated C touches values only through `jsrt_value.h` accessors; every generated function opens
  `JSRT_FRAME(n)` and pops it on every exit path, including landing pads.

## 4. Value flow at a type boundary (activity view)

Why typed code is fast and untyped code still works (plan §1, §2):

```mermaid
flowchart TD
    V[value] --> Q{statically typed<br/>and trusted?}
    Q -- "yes (checked .ts code)" --> RAW["raw machine value<br/>(unboxed i32 / f64 / struct field)"]
    Q -- "no (unknown, union, JSON.parse,<br/>FFI, .js → .ts import)" --> BOX["NaN-boxed jsrt_value<br/>(tag + 48-bit payload)"]
    BOX --> NARROW{runtime boundary check<br/>at the narrowing point}
    NARROW -- passes --> RAW
    NARROW -- fails --> ERR["STA2001 runtime type error<br/>with source location"]
```
