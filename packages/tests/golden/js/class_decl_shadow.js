// plan.md §8 step 23: a shadowed class declaration gets its own identity. Classes used to
// bypass Scope.declare with the descriptor keyed by source name, so an inner `class C`
// resolved to the outer one (and a differing member set aborted with STA4072). Routed through
// the same alpha-renaming as every other binding, the nested, sibling and function-shadowed
// shapes below all match the pinned Node byte-for-byte.

class C {
  m() {
    return 'outer';
  }
}

// Nested: the block's `C` is its own descriptor, the outer one survives the block.
{
  class C {
    m() {
      return 'inner';
    }
  }
  console.log(new C().m());
}
console.log(new C().m());

// Siblings with DIFFERING member sets: each block compiles against its own layout.
{
  class C {
    m() {
      return 'sib1';
    }
    extra() {
      return 1;
    }
  }
  const a = new C();
  console.log(a.m());
  console.log(a.extra());
  console.log(a instanceof C);
}
{
  class C {
    m() {
      return 'sib2';
    }
  }
  console.log(new C().m());
}

// Function-shadowed: the function's `C` answers inside, the outer one outside.
function f() {
  class C {
    m() {
      return 'func';
    }
  }
  return new C().m();
}
console.log(f());
console.log(new C().m());

// Statics are per declaration, and an instance prints under its source name.
class S {
  static n() {
    return 'outer-static';
  }
}
{
  class S {
    static n() {
      return 'inner-static';
    }
  }
  console.log(S.n());
}
console.log(S.n());
console.log(new C());
