// @mode: js
// @verdict: dynamic
// SUBSET.md: delete on a dynamic shape (optional property / index signature / Unknown receiver)

function drop(target, key) {
  return delete target[key];
}
export { drop };
