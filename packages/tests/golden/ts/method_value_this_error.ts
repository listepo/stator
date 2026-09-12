// plan.md §8 step 12(e): a bare method value with no receiver raises when the body reads `this`.

class C {
  x = 1;
  m(): number {
    return this.x;
  }
}

const g = new C().m;
try {
  console.log(g());
} catch (caught) {
  if (caught instanceof TypeError) {
    console.log(caught.message);
  }
}
