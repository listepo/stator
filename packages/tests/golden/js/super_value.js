// plan.md §8 step 42: `super.m` as a value is the base's method as an unbound closure.

class A {
  who() {
    return 'A';
  }
  identify(other) {
    return other === this;
  }
  add(a, b) {
    return a + b;
  }
}
class B extends A {
  who() {
    return 'B';
  }
}
class C extends B {
  who() {
    return 'C';
  }
  run() {
    // Tear-off: the immediate base's implementation, skipping this class's own override.
    const w = super.who;
    console.log(w());
    // Call: the same implementation, on this receiver.
    console.log(super.who());
    // The receiver reaches the base method.
    console.log(super.identify(this));
    // Arity survives the tear-off: `this` drops, the arguments shift.
    const plus = super.add;
    console.log(plus(1, 2));
    // Torn off and called bare, `this` is undefined, so the receiver is not it.
    const torn = super.identify;
    console.log(torn(this));
    return 0;
  }
}
new C().run();
