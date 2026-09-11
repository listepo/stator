// `new Date(NaN).toISOString()` throws a RangeError OBJECT (plan-notes 222), not a bare string:
// the runtime pended the message alone, so `e instanceof RangeError` was false and `e.name` was
// undefined for the one throw a program is most likely to catch.
try {
  new Date(NaN).toISOString();
} catch (e) {
  console.log(e instanceof RangeError);
  console.log(e instanceof Error);
  console.log(e.name);
  console.log(e.message);
  console.log(typeof e.message);
}
console.log(new Date(0).toISOString());
console.log(new Date(NaN).toJSON());
try {
  new Date(NaN).toISOString();
} catch (e) {
  console.log('recovered');
}
