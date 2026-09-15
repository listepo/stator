// plan.md §8 step 24: a method value through `?.` on a nullable class dispatches statically —
// a non-nullish base loads the closure (or calls it, receiver and all); a nullish base answers
// `undefined` without running keys or arguments.
class Box {
  n: number = 10;
  add(a: number, b: number): number {
    return a + b + this.n;
  }
  label(): string {
    return "box";
  }
}

class LoudBox extends Box {
  override label(): string {
    return "loud";
  }
}

function calls(box: Box | null): void {
  console.log(box?.add(1, 2));
  console.log(box?.add(1, 2) ?? -1);
}

calls(new Box());
calls(null);

function reads(box: Box | undefined): void {
  console.log(box?.add);
  console.log(typeof box?.add);
}

reads(new Box());
reads(undefined);

function tearoff(box: Box | null): void {
  const g = box?.label;
  console.log(g);
  console.log(g?.() ?? "nog");
}

tearoff(new Box());
tearoff(null);

function unbound(box: Box | null): void {
  const g = box?.add;
  try {
    console.log(g?.(1, 2) ?? "nog");
  } catch (caught) {
    if (caught instanceof TypeError) {
      console.log(caught.message);
    }
  }
}

unbound(new Box());
unbound(null);

let evaluated = 0;
function arg(x: number): number {
  evaluated += 1;
  return x;
}

function skipped(box: Box | null): void {
  evaluated = 0;
  console.log(box?.add(arg(1), arg(2)) ?? "nocall");
  console.log(evaluated);
}

skipped(new Box());
skipped(null);

function overrides(box: Box | undefined): void {
  console.log(box?.label());
  console.log(box?.label() ?? "none");
}

overrides(new LoudBox());
overrides(new Box());
overrides(undefined);
