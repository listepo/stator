// @mode: js
// @verdict: dynamic
// SUBSET.md: Calls of an object's function-valued field

// A plain `function` stored in a field sees the object as `this` when called through it. Its
// `this` is dynamic -- the function cannot know which object calls it -- so the file grades
// dynamic, but the call itself is the slot-loaded field call.
function describe() {
  return this.tag;
}
const o = { tag: "box", describe };
export const tag = o.describe();
