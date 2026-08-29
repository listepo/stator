/* HIR passes (plan.md §5 Tasks 3.6–3.9).
 *
 * Two of the transformations this directory was planned to hold are not here, and both are absent
 * for the same reason: monomorphization (Task 3.4) and boundary-check insertion (Task 3.5) happen
 * at the LOWERING, because each needs a fact — a type substitution, a narrowing — that lives in the
 * `ts.Type` world and is gone by the time an HIR exists. A pass would have to reconstruct from the
 * output what the input already knew. See plan-notes.md entries 73 and 74.
 *
 * What is here is the work that genuinely operates on HIR, in the one order in which each pass
 * feeds the next.
 */

import type { Module } from '../hir/nodes.ts';
import { constFold } from './constfold.ts';
import { eliminateDeadCode } from './dce.ts';
import { inlineCalls } from './inline.ts';

export { constFold } from './constfold.ts';
export { eliminateDeadCode } from './dce.ts';
export { inlineCalls } from './inline.ts';
export type { Rewriter } from './rewrite.ts';

/** Every pass, in order, applied once.
 *
 * The order is a chain rather than a preference. Inlining exposes constants: `double(2)` becomes
 * `2 * 2`, which was not a foldable expression a moment earlier. Folding then decides branches:
 * `if (1 < 2)` is not a literal condition until `1 < 2` is `true`. And eliminating those branches
 * is what finally makes a function unreachable, which is why the shake runs last.
 *
 * Once, not to a fixpoint. Each pass can enable the next, so a second round would find a little
 * more, and iterating until nothing changes is a real option — with a real cost in compile time
 * and a real risk of a pass pair that oscillates. That trade wants a measurement (§13) and there is
 * none yet, so the pipeline runs the chain that the passes were ordered to serve and stops.
 *
 * Every pass preserves `Unknown`: none of them introduces a type, and each declines any rewrite
 * that would replace a subtree with one of a different HType — which is what keeps a boundary check
 * attached to the value that needs it. The verifier runs after this in `build.ts`, over the
 * OPTIMIZED module, so a pass that broke the HIR is a caught bug rather than bad C. */
export function optimize(module: Module): Module {
  return eliminateDeadCode(constFold(inlineCalls(module)));
}
