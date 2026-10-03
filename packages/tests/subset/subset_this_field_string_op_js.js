// @mode: js
// @verdict: dynamic
// SUBSET.md: Methods of a string or number the compiler only knows as Unknown

// `this` in an object literal's `function` is dynamic, so `this.name` is Unknown even though the
// checker types it `string` from the literal: the call is dynamic, not a string op.
const person = {
  name: "ada",
  shout: function () {
    return this.name.toUpperCase();
  },
};
export const loud = person.shout();
