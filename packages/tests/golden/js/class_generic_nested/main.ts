// js-mode twin of `ts/class_generic_nested.ts`: the same in-place specializations under `--mode=js`.

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
