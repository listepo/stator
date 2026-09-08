/* Stator's Test262 host adapter: `$DONE` only.
 *
 * INTERPRETING.md makes `$DONE` the HOST's job and everything else the corpus's. This file is named
 * `done.js` for that reason: it was once called `sta.js`, which reads as "the corpus's sta.js" while
 * actually replacing it, so `Test262Error` did not exist and every harnessed test failed to compile
 * on a defect of the runner's own (plan-notes 175). Never define a corpus name here. */
// biome-ignore lint/correctness/noUnusedVariables: the concatenated Test262 body calls this global.
var $DONE = (error) => {
  if (error !== undefined) throw error;
  console.log('Test262:AsyncTestComplete');
};
