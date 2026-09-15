// plan.md §8 step 45: ts-mode pin -- statically-typed method dispatch is unchanged by the
// dynamic Unknown path. Direct calls, virtual dispatch through a base, literal methods with
// `this`, and nullable single-class optional chains all lower statically as before.

class Box {
  v = 5;
  add(a: number): number {
    return this.v + a;
  }
}
const box = new Box();
console.log(box.add(3));
console.log(typeof box.add);

const lit = {
  x: 10,
  m(): number {
    return this.x + 1;
  },
};
console.log(lit.m());

class Base {
  greet(): string {
    return "hi";
  }
}
class Child extends Base {}
class Loud extends Base {
  override greet(): string {
    return "yo";
  }
}
const child: Base = new Child();
console.log(child.greet());
const loud: Base = new Loud();
console.log(loud.greet());

function opt(c: Box | undefined): number | undefined {
  return c?.add(1);
}
console.log(opt(new Box()));
console.log(opt(undefined));
function optRead(c: Box | undefined): unknown {
  return c?.add;
}
console.log(typeof optRead(new Box()));
console.log(optRead(undefined) === undefined);
