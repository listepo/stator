// Functions without captures: hoisting, recursion, mutual recursion, arrow and function
// expressions, early return, and void functions observed through a module-level binding.

// Called before its declaration: bindings are established at the top of the unit, not in
// statement order.
console.log(fact(6));

function fact(n: number): number {
  if (n <= 1) {
    return 1;
  }
  return n * fact(n - 1);
}

// Mutual recursion works for the same reason a self-call does: a module-level binding is
// visible from every function body, so neither name has to be declared first.
function isEven(n: number): boolean {
  if (n === 0) {
    return true;
  }
  return isOdd(n - 1);
}

function isOdd(n: number): boolean {
  if (n === 0) {
    return false;
  }
  return isEven(n - 1);
}

console.log(isEven(10));
console.log(isOdd(10));

const square: (x: number) => number = (x) => x * x;
const greet: (who: string) => string = function (who: string): string {
  return "hello, " + who;
};

console.log(square(9));
console.log(greet("world"));

// Early return out of a loop: the frame must pop on that path too, not just the fallthrough.
function firstSquareOver(limit: number): number {
  let i: number = 0;
  while (i < 100) {
    if (i * i > limit) {
      return i;
    }
    i = i + 1;
  }
  return -1;
}

console.log(firstSquareOver(50));

// A void function's effect is only visible through what it writes.
let counter: number = 0;

function bump(by: number): void {
  if (by === 0) {
    return;
  }
  counter = counter + by;
}

bump(3);
bump(0);
bump(4);
console.log(counter);
