// A JSDoc promise is not proof of the runtime value. These used to crash or abort.
/** @returns {Generator<number, void, unknown>} */
function broken() {
  return 1;
}

try {
  for (const value of broken()) {
    console.log('unreachable body');
    console.log(value);
  }
} catch (e) {
  console.log(e.name);
  console.log(e instanceof TypeError);
  console.log(e instanceof Error);
} finally {
  console.log('iteration finally');
}

try {
  broken().next();
  console.log('unreachable next');
} catch (e) {
  console.log(e.name);
}
try {
  broken().return();
  console.log('unreachable return');
} catch (e) {
  console.log(e.name);
}
try {
  broken().throw(42);
  console.log('unreachable throw');
} catch (e) {
  console.log(e.name);
}

function* valid() {
  yield 7;
}
for (const value of valid()) {
  console.log(value);
}
