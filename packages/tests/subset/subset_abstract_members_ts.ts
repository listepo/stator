// @mode: ts
// @verdict: not-yet
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// An abstract method or accessor declares a name and no function (plan-notes 233). The abstract
// method's slot is filled by each concrete descendant's table, so a call through the base is virtual.
// Implementing an abstract ACCESSOR is an accessor override, which lands with the override rules.

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
