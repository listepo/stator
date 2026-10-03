/* The in-process runners' seam into test-impact recording (plan.md §9 Task 6.17). Without
 * STATOR_IMPACT_RECORD this is `undefined` and the recorder module is never loaded. */
import type { InProcessRecorder } from '../impact/recorder.ts';

export async function impactRecorder(
  harness: string,
  fixtureRoots: readonly string[],
): Promise<InProcessRecorder | undefined> {
  if (process.env['STATOR_IMPACT_RECORD'] === undefined) return undefined;
  const { inProcessRecorder } = await import('../impact/recorder.ts');
  return inProcessRecorder(harness, fixtureRoots);
}
