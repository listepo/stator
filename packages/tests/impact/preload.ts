/* `node --import ./packages/tests/impact/preload.ts …` (plan.md §9 Task 6.17): starts the impact
 * recorder before the first module of the run loads — precise coverage that starts later misses
 * everything a module does while it loads. Inert unless STATOR_IMPACT_RECORD is set. */
import { installRecorder } from './recorder.ts';

await installRecorder();
