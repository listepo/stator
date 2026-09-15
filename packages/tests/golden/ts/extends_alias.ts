// `extends` through a class alias (plan.md §8 step 43): `const K = C` binds no value, so a
// heritage base naming the alias grounds to the target's layout -- the descriptor, the
// inherited-method owner, the vtable and the super-call all name `C`, exactly as for the
// direct spelling. A chained alias erases the same way; a generic alias grounds its one
// complete tuple (`extends K<number>` names `Box<number>`).

class Animal {
  name: string;
  static count: number = 0;
  constructor(name: string) {
    this.name = name;
    Animal.count = Animal.count + 1;
  }
  speak(): string {
    return this.name;
  }
}
const K = Animal;
const J = K;

class Dog extends K {
  trick: string;
  constructor(name: string, trick: string) {
    super(name);
    this.trick = trick;
  }
  override speak(): string {
    return super.speak() + "!";
  }
  show(): string {
    return this.speak() + " " + this.trick;
  }
}
const JD = Dog;

class Pup extends JD {
  constructor(name: string) {
    super(name, "sit");
  }
}

class Box<T> {
  value: T;
  constructor(v: T) {
    this.value = v;
  }
  get(): T {
    return this.value;
  }
  describe(): string {
    return "box";
  }
}
const BK = Box;

class Sub extends BK<number> {
  w: number;
  constructor(v: number, w: number) {
    super(v);
    this.w = w;
  }
  override describe(): string {
    return "sub";
  }
  sum(): number {
    return this.get() + this.w;
  }
}

const d = new Dog("Rex", "roll");
console.log(d.show());
console.log(d.speak());
console.log(d.trick);
console.log(d instanceof Dog);
console.log(d instanceof Animal);
console.log(new Pup("Bo") instanceof Animal);
console.log(Dog.count);
const s = new Sub(40, 2);
console.log(s.sum());
console.log(s.describe());
console.log(s.get());
console.log(s instanceof Sub);
