// @mode: js
// @verdict: dynamic
// SUBSET.md: Assignment to an array's length

// Writing `length` shrinks the array (ECMA-262 §10.4.2.4), in statement and value position. The
// write goes through the runtime's property-write entry, which is the dynamic path.
const xs = [1, 2, 3, 4, 5];
xs.length = 3;
xs.length -= 1;
xs.length--;
function drop(r) {
  return (r.length = r.length - 1);
}
export const left = drop([1, 2]);
