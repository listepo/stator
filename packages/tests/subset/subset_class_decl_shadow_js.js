// @mode: js
// @verdict: static
// SUBSET.md: class declarations are block-scoped bindings (plan.md §8 step 23). A nested class
// that re-declares an outer name gets its own descriptor instead of sharing the outer one.

class C {
  m() {
    return 'outer';
  }
}

let inner = '';
{
  class C {
    m() {
      return 'inner';
    }
    extra() {
      return 1;
    }
  }
  const a = new C();
  inner = a.m() + a.extra();
}

const o = new C();
export const outer = o.m();
export const nested = inner;
