// @mode: ts
// @verdict: dynamic
// SUBSET.md: Methods of a string or number the compiler only knows as Unknown

// The ts-mode twin. A `function` stored in an object literal has a dynamic `this` in both modes,
// so `this.name` is Unknown here too, whatever the checker infers from the literal, and the
// call is the dynamic method call rather than a string op.
const person = {
  name: "ada",
  shout: function (): string {
    return this.name.toUpperCase();
  },
};
export const loud: string = person.shout();
