// @mode: js
// @verdict: dynamic
// SUBSET.md: Assignment to a property the object's shape does not declare

// A function grown onto the object is called with the object as receiver.
const host = { name: 'h' };
host.describe = function () {
  return 'host ' + this.name;
};
console.log(host.describe());
