// plan.md §8 step 12(e): calling a class field that holds a function.

class Runner {
  run = (n) => {
    return n + 1;
  };
}

console.log(new Runner().run(41));
