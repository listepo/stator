// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// The js-mode twin: `abstract` exists only in a `.ts` file, which js mode compiles alongside
// JavaScript (plan-notes 233).

abstract class Animal {
  abstract sound(): string;
  speak(): string {
    return `says ${this.sound()}`;
  }
}
class Dog extends Animal {
  sound(): string {
    return 'woof';
  }
}
abstract class Shaped {
  abstract get area(): number;
}
abstract class Round extends Shaped {}
export const x = new Dog().speak();
