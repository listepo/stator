// plan.md §8 step 20: the receiver check is transparent on valid values in ts mode -- a
// boundary-narrowed array takes the static path and answers Node's answer.
function pushIt(a: unknown): number {
  const arr = a as number[];
  arr.push(9);
  return arr.length;
}
console.log(pushIt([1, 2]));
