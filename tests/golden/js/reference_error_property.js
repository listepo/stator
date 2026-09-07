// Phase 5 step 2a(c): TypeScript's inferred JS namespaces are not runtime declarations.
function rhs() {
  console.log('rhs ran');
  return 1;
}
function key() {
  console.log('key ran');
  return 0;
}

// Resolving the receiver throws before either the computed key or RHS can run.
try {
  missingNamespace.a = rhs();
} catch (e) {
  console.log(e.name);
  console.log(e.message);
  console.log(e instanceof ReferenceError);
  console.log(e instanceof Error);
}
try {
  missingIndex[0] = rhs();
} catch (e) {
  console.log(e.name);
  console.log(e.message);
}
try {
  missingNamespace[key()] = rhs();
} catch (e) {
  console.log(e.message);
}

// A sibling property assignment supplies the checker symbol at every use of this name.
console.log(typeof missingNamespace);
console.log(typeof (missingIndex));
try {
  console.log(missingNamespace);
} catch (e) {
  console.log(e.message);
}
try {
  missingNamespace = rhs();
} catch (e) {
  console.log(e.message);
}
try {
  missingNamespace += rhs();
} catch (e) {
  console.log(e.message);
}
try {
  missingNamespace++;
} catch (e) {
  console.log(e.message);
}

// The special typeof rule is only for an identifier, not a property read.
try {
  console.log(typeof missingNamespace.a);
} catch (e) {
  console.log(e.message);
} finally {
  console.log('finally ran');
}

// Real declarations merged with expando metadata must keep their runtime bindings.
const real = { a: 0 };
real.a = rhs();
console.log(real.a);
console.log(typeof real);
function local() {
  const missingNamespace = { a: 7 };
  missingNamespace.a = 8;
  console.log(missingNamespace.a);
}
local();
