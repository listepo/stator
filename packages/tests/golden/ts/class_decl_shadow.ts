// plan.md §8 step 23: a shadowed class declaration gets its own identity. The ts-mode twin
// of golden/js/class_decl_shadow.js -- nested, sibling (with differing member sets) and
// function-shadowed classes, instanceof, per-declaration statics and the source-name display.

class C {
  m(): string {
    return 'outer';
  }
}

{
  class C {
    m(): string {
      return 'inner';
    }
  }
  console.log(new C().m());
}
console.log(new C().m());

{
  class C {
    m(): string {
      return 'sib1';
    }
    extra(): number {
      return 1;
    }
  }
  const a: C = new C();
  console.log(a.m());
  console.log(a.extra());
  console.log(a instanceof C);
}
{
  class C {
    m(): string {
      return 'sib2';
    }
  }
  console.log(new C().m());
}

function f(): string {
  class C {
    m(): string {
      return 'func';
    }
  }
  return new C().m();
}
console.log(f());
console.log(new C().m());

class S {
  static n(): string {
    return 'outer-static';
  }
}
{
  class S {
    static n(): string {
      return 'inner-static';
    }
  }
  console.log(S.n());
}
console.log(S.n());
console.log(new C());
