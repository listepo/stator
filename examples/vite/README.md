# Vite demo: `vite build` writes a native binary

A `js`-mode program that imports a `node_modules` package, built by Vite through the
`stator()` plugin from [`vite-stator`](../../packages/vite-stator) (plan.md §11d T12.2,
[`docs/BUNDLER.md`](../../docs/BUNDLER.md)).

| File | What it is |
|---|---|
| `src/main.js` | the entry: a default and a named import from `greeting` |
| `greeting/` | a local package, linked into `node_modules/greeting` (`link:./greeting`) |
| `vite.config.ts` | `stator({ entry: 'src/main.js', out: 'dist/hello' })` |

Build and run (after `pnpm install` at the repo root, which links this workspace package, and
`pnpm run runtime`, which builds the archives every Stator binary links):

```
cd examples/vite
pnpm run build        # vite build → dist/hello
./dist/hello
node src/main.js      # prints the same line
```

What happens: Vite's own pass writes nothing. The plugin calls `statorc/api`'s `compile` with
the entry. Stator compiles `src/main.js` as its own module graph, and only the package import
goes to the default adapter, which bundles `greeting` into one tree-shaken module: `shout`,
never imported, does not reach the binary. A diagnostic inside the package names
`node_modules/greeting/index.js` and its line, through the bundle's source map.

`packages/tests/unit/vite-stator.test.ts` runs this build and compares the binary's stdout with
Node's.
