// `extends` through a class alias (plan.md §8 step 43): `const K = C` binds no value, so a
// heritage base naming the alias grounds to the target's layout -- the descriptor, the
// inherited-method owner, the vtable and the super-call all name `C`, exactly as for the
// direct spelling. A chained alias erases the same way.

class Animal {
  constructor(name) {
    this.name = name;
  }
  speak() {
    return this.name;
  }
}
const K = Animal;
const J = K;

class Dog extends K {
  constructor(name, trick) {
    super(name);
    this.trick = trick;
  }
  show() {
    return this.speak() + " " + this.trick;
  }
}
const JD = Dog;

class Pup extends JD {
  constructor(name) {
    super(name, "sit");
  }
}

const d = new Dog("Rex", "roll");
console.log(d.show());
console.log(d.speak());
console.log(d.trick);
console.log(d instanceof Dog);
console.log(d instanceof Animal);
console.log(new Pup("Bo") instanceof Animal);
console.log(new Pup("Bo").show());
