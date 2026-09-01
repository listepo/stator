/* Which roadmap phases are finished, so a `not-yet` diagnostic can be checked against them.
 *
 * plan.md §15: a `not-yet` names the phase that owns its BLOCKER, never the phase that happens to
 * be open, and when a phase closes every code naming it is delivered or reassigned in that same
 * change. Nothing enforced that. Phase 3 closed on 2026-08-30 and seventy gate sites went on
 * telling users their construct was "planned for Phase 3" -- a shipped promise pointing at
 * finished work (plan-notes 136). This list is what `tests/unit/phases.test.ts` checks the gate
 * against, and the test pins the list itself against `done.md`'s headings so the two cannot drift.
 *
 * `done.md` is the authority; this is its machine-readable projection. Add a phase here in the
 * same change that marks it complete there -- the test fails on either half alone.
 *
 * THE NO-PHASE CASE. Some not-yets have no phase to name, and the convention is to OMIT `phase`
 * rather than invent a number (`Diagnostic.phase` is optional for exactly this reason). Two kinds
 * exist today: `STA1215` names a BUILD FLAG (`make -C runtime intl`), and the `Date` residue waits
 * on that same flag's ICU data. Neither is scheduled -- both are available right now to anyone who
 * builds the runtime with the feature on -- so a phase number would read as "wait for release N",
 * which is false in a way no reassignment fixes. The message names the flag instead. */
export const COMPLETED_PHASES: readonly number[] = [0, 1, 2, 3, 4];
