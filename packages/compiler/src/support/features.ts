/** Which runtime archive this compilation links against, and therefore which builtins the gate may
 * accept (plan.md §5 Task 4.4).
 *
 * `STATOR_RUNTIME` selects the archive in `src/cli/build.ts`; the gate reads the SAME value, so a
 * program can never be accepted against a surface the archive it links does not carry. One
 * variable rather than a flag per consumer is the point: the archive and the policy cannot
 * disagree if there is only one thing to disagree about.
 *
 * Read at CALL time, not module load, so a test can set the variable around a single gate run.
 * `build()` resolves it once and pins it for the whole compile (`withRuntimeFlavor`), so the gate
 * and the link read one value even when the environment changes in between (plan.md §9
 * Task 6.21).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type RuntimeFlavor = 'default' | 'asan' | 'intl';

const pinned = new AsyncLocalStorage<RuntimeFlavor>();

export function runtimeFlavor(): RuntimeFlavor {
  const fixed = pinned.getStore();
  if (fixed !== undefined) {
    return fixed;
  }
  const requested = process.env['STATOR_RUNTIME'];
  return requested === 'asan' || requested === 'intl' ? requested : 'default';
}

/** Run `fn` with `runtimeFlavor()` answering `flavor`, whatever the environment says meanwhile.
 * Per async context, so concurrent in-process builds keep their own flavor. */
export function withRuntimeFlavor<T>(flavor: RuntimeFlavor, fn: () => T): T {
  return pinned.run(flavor, fn);
}

/** ICU is a feature build, off by default: it costs ~10 MB of CLDR data, and the default runtime
 * must stay byte-identical whether or not the host happens to have ICU installed. */
export function intlEnabled(): boolean {
  return runtimeFlavor() === 'intl';
}
