/* Stator's small Test262 adapter. The full assertion library is supplied by the corpus. */
// biome-ignore lint/correctness/noUnusedVariables: the concatenated Test262 body calls this global.
var $DONE = function $DONE(error) {
  if (error !== undefined) throw error;
};
