/* HIR passes: monomorphize, shape-resolve, boundary-check insert, const-fold, DCE, inline.
 * The verifier runs after each pass in debug builds. No pass may elide a check on `Unknown`.
 * Filled in along plan.md §6. */
export {};
