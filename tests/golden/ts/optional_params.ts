function f(x?: number) {
  if (x === undefined) {
    console.log(0);
  } else {
    console.log(x);
  }
}
f();
f(3);
