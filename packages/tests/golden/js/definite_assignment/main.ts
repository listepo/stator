// Definite assignment in js mode (TS2454 suppressed): an uninitialized annotated
// binding holds `undefined` at run time, and every use answers Node's value --
// a plain read, a write-then-read, an optional call, and method calls that throw
// Node's catchable TypeError off an `undefined` receiver.

// Uninitialized read answers `undefined`.
let x: number;
console.log(x);

// Write-then-read is fully static again: no diagnostic, no dynamic path.
x = 2;
console.log(x);
console.log(x + 1);

// An optional call on an uninitialized function answers `undefined`.
let f: () => number;
console.log(f?.());

// A method call on an uninitialized class instance throws Node's catchable
// TypeError -- the receiver goes through the shape table, never a direct call.
class C {
  m(): number {
    return 1;
  }
}
let o: C;
try {
  console.log(o.m());
} catch (e) {
  console.log(e.name);
  console.log(e.message);
}

// An uninitialized array reads `undefined`; once assigned its methods resolve
// through Array.prototype on the dynamic path.
let a: number[];
console.log(a);
a = [1, 2];
a.push(3);
console.log(a.length);
console.log(a[2]);

// An uninitialized string's method throws the same catchable TypeError; once
// assigned, `.length` reads through the dynamic field path.
let s: string;
try {
  console.log(s.toUpperCase());
} catch (e) {
  console.log(e.name);
}
s = 'abc';
console.log(s.length);
