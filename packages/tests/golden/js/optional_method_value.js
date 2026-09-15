// plan.md §8 step 24: a method value through `?.` on a nullable class dispatches statically —
// a non-nullish base loads the closure (or calls it, receiver and all); a nullish base answers
// `undefined` without running keys or arguments. Untyped spelling of optional_method_value.ts.
class Box {
  constructor() {
    this.n = 10;
  }
  add(a, b) {
    return a + b + this.n;
  }
  label() {
    return "box";
  }
}

class LoudBox extends Box {
  label() {
    return "loud";
  }
}

/** @param {Box | null} box */
function calls(box) {
  console.log(box?.add(1, 2));
  console.log(box?.add(1, 2) ?? -1);
}

calls(new Box());
calls(null);

/** @param {Box | undefined} box */
function reads(box) {
  console.log(box?.add);
  console.log(typeof box?.add);
}

reads(new Box());
reads(undefined);

/** @param {Box | null} box */
function tearoff(box) {
  const g = box?.label;
  console.log(g);
  console.log(g?.() ?? "nog");
}

tearoff(new Box());
tearoff(null);

/** @param {Box | null} box */
function unbound(box) {
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
function arg(x) {
  evaluated += 1;
  return x;
}

/** @param {Box | null} box */
function skipped(box) {
  evaluated = 0;
  console.log(box?.add(arg(1), arg(2)) ?? "nocall");
  console.log(evaluated);
}

skipped(new Box());
skipped(null);

/** @param {Box | undefined} box */
function overrides(box) {
  console.log(box?.label());
  console.log(box?.label() ?? "none");
}

overrides(new LoudBox());
overrides(new Box());
overrides(undefined);
