/** The global environment Stator's runtime actually provides.
 *
 * Compiled programs do not run on Node or in a browser, so they get neither `@types/node` nor the
 * DOM lib: borrowing either would let a program type-check against globals that do not exist in
 * the emitted binary, and the failure would surface as a link error instead of a diagnostic.
 *
 * This file grows only alongside `runtime/` — a declaration here is a promise that `libjsrt.a`
 * has the symbol. Phase 2's runtime provides exactly one thing.
 */

interface Console {
  /** Maps to `jsrt_print`, which follows console.log's formatting rules, not ToString's:
   * `-0` prints as "-0" (docs/VALUE.md §3.3). Phase 2 emits one argument.
   *
   * The array arm is `readonly unknown[]` so that every element type and every nesting depth is
   * covered by one declaration. It is a promise `jsrt_print` keeps: the runtime reproduces Node's
   * `util.inspect` for arrays, including grouping, the 80-column break and the depth cap, and
   * `runtime/tests/print_arrays.*` is the paired corpus that holds it to that byte-for-byte. */
  log(value: number | string | boolean | null | undefined | readonly unknown[] | object): void;
}

declare const console: Console;
