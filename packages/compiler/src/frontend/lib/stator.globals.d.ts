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
  /** Same formatting as `log`, same stream: Node's `info` and `debug` are stdout aliases. */
  info(value: number | string | boolean | null | undefined | readonly unknown[] | object): void;
  debug(value: number | string | boolean | null | undefined | readonly unknown[] | object): void;
  /** Same formatting as `log`, on STDERR — Node's split, mapped to `jsrt_eprint`. The golden
   * runner compares both streams byte-for-byte, so the split is held to Node's, not asserted. */
  error(value: number | string | boolean | null | undefined | readonly unknown[] | object): void;
  warn(value: number | string | boolean | null | undefined | readonly unknown[] | object): void;
  /** `log`'s formatting WITHOUT its one exception: a top-level string keeps its quotes, so
   * `console.dir("a")` is `'a'` where `console.log("a")` is `a`. */
  dir(value: number | string | boolean | null | undefined | readonly unknown[] | object): void;
  /** Prints the label (when given) and indents every later console line by two spaces, until a
   * matching `groupEnd`. The indent applies to EACH line of a multi-line inspect, as in Node. */
  group(label?: number | string | boolean | null | readonly unknown[] | object): void;
  /** Outdents one level. Unmatched, it is a no-op — Node's behaviour, not an error. */
  groupEnd(): void;
  /** The box-drawn grid: a leading `(index)` column, one column per key seen across the rows in
   * first-seen order, and a trailing `Values` column for rows that are not objects. Cells are
   * inspect form (a string cell is quoted), a missing key leaves the cell empty, and a value that
   * is not a collection of rows falls back to `log` — all of it Node's own rule set, held to it
   * byte-for-byte by `tests/golden/ts/console_builtins.ts`.
   *
   * The parameter is deliberately wider than what draws a table: `console.table(x)` is legal in
   * Node for any value, and the fallback is part of the behaviour. A `Map` or a `Set` is refused
   * by the gate instead of typed out, because Node draws those with a different table (an
   * `(iteration index)` column, plus `Key` for a Map) that has not landed. */
  table(value: number | string | boolean | null | undefined | readonly unknown[] | object): void;
  /** Starts a timer under `label` (`default` when omitted) and prints nothing. Re-timing a label
   * that is already running keeps the ORIGINAL start, as in Node. */
  time(label?: string): void;
  /** Prints `label: <duration>` on stdout and stops the timer — Node's unit ladder, milliseconds
   * below a second. A label that was never started prints nothing, which is what Node writes to
   * stdout for that case (it warns on a channel this runtime does not have).
   *
   * Under the DETERMINISM CARVE-OUT with `time` and `trace`: a duration measures this machine on
   * this run, so no golden test can hold it to Node. `tests/unit/console-carveout.test.ts` is the
   * proof instead — the label is echoed, a duration follows, the unit is `ms`. */
  timeEnd(label?: string): void;
  /** `Trace: <message>` on STDERR, or bare `Trace` without one. Node follows it with stack frames;
   * this runtime has no unwinder and does not fabricate any — the same decision `jsrt_uncaught`
   * made, that inventing frames is worse than omitting them. Carved out for that reason. */
  trace(message?: string): void;
  /** Per-label tally, printed as `label: n`; the label-less form counts under `default`. */
  count(label?: string): void;
  /** Zeroes a tally and prints nothing. */
  countReset(label?: string): void;
  /** Nothing when the condition holds; `Assertion failed[: message]` on STDERR when it does not. */
  assert(condition: boolean, message?: string): void;
}

declare const console: Console;
