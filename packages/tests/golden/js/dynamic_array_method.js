// plan.md §8 step 20: a method call on an Unknown receiver resolves through Array.prototype
// instead of aborting STA2006 where Node runs.
function pushIt(a) {
  a.push(9);
  return a.length;
}
console.log(pushIt([1, 2]));

// A nullish receiver still throws Node's catchable TypeError.
try {
  pushIt(undefined);
  console.log('pushIt(undefined): no throw');
} catch (e) {
  console.log(e.name);
  console.log(e.message);
}

// An own property shadows the prototype method: the shape table is asked first.
function setPush(a, f) {
  a.push = f;
}
function callPush(a, v) {
  return a.push(v);
}
const shadowed = [1];
setPush(shadowed, function (v) {
  return 'own:' + v;
});
console.log(callPush(shadowed, 7));
console.log(shadowed.length);

// The variadic and callback-taking methods share their cores with the static multi-argument
// entries, so the dynamic path answers the same values.
function variadic(a) {
  a.push(1, 2);
  a.unshift(0);
  return a.join(',');
}
console.log(variadic([]));
function concatBoth(a, b, v) {
  return a.concat(b).join(',') + '|' + a.concat(v).join(',');
}
console.log(concatBoth([1], [2], 3));
function spliceIns(a) {
  const removed = a.splice(1, 1, 7, 8);
  return removed.join(',') + '|' + a.join(',');
}
console.log(spliceIns([1, 2, 3]));
function mapped(a) {
  return a.map(function (x) {
    return x * 2;
  }).join(',');
}
console.log(mapped([1, 2, 3]));
