# Todo demo: one shared core, both modes

`shared.ts` is a small typed task store (create, toggle, count, clear,
summarize) with no I/O. Two entries use it:

| Entry | Mode | What it proves |
|---|---|---|
| `main-ts.ts` | `ts` | the shared core compiles statically |
| `main-js.js` | `js` | untyped code imports the same typed core (mixed graph) |

Build and run (from the repo root, on the pinned Node — `mise exec node --`
if bare `node` is off-pin):

```
node packages/compiler/src/cli/main.ts build examples/todo/main-ts.ts -o todo-ts
node packages/compiler/src/cli/main.ts build examples/todo/main-js.js -o todo-js --mode=js
./todo-ts && ./todo-js
```

Both binaries must print exactly what Node prints for the same entries:

```
node examples/todo/main-ts.ts
node examples/todo/main-js.js
```

`stator explain` reports the split: the `ts` entry is static-or-dynamic per
function with no errors, and the `js` entry shows the same shared functions
reached across the mixed-graph boundary. If either entry stops matching Node
byte-for-byte, that is a semantics bug in the compiler, not in this example.
