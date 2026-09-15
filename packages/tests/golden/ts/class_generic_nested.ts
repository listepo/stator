// A generic class nested in a function or block (plan.md §8 step 12(d)/(f)): each tuple
// specializes in place, scoped to that evaluation exactly like a nested ordinary class —
// including captures of the enclosing scope. The name must be unique across the program,
// and no enclosing scope may bind a type parameter the tuple would close over.

function f(n: number): number {
  class Local<T> {
    static tag: string = "L";
    v: T;
    constructor(x: T) {
      this.v = x;
    }
    get(): T {
      return this.v;
    }
    addN(): number {
      return n + 1;
    }
  }
  const a = new Local<number>(10);
  console.log(a.get());
  console.log(new Local<string>("s").get());
  console.log(a.addN());
  console.log(Local.tag);
  return a.get() + n;
}
console.log(f(5));
{
  class BlockBox<T> {
    v: T;
    constructor(x: T) {
      this.v = x;
    }
  }
  console.log(new BlockBox<boolean>(true).v);
}
