// Deep recursion throws Node's catchable RangeError in js mode too (plan.md §9 Task 6.23).
function down(n) {
  return n === 0 ? 0 : 1 + down(n - 1);
}

try {
  down(1e7);
} catch (e) {
  console.log(e instanceof RangeError, e.message);
}

function walk(o) {
  return walk({ next: o });
}
try {
  walk(null);
} catch (e) {
  console.log(e.name + ': ' + e.message);
}
console.log(down(100));
