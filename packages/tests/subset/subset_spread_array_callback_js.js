// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Array.prototype (landed surface)
// The callback ops keep their argument rules, which a spread's list hides (plan.md §11c T11.4
// step 5).
const nums = [1, 2, 3];
console.log(nums.map(...[(x) => x * 2]));
