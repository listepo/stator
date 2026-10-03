// Calls of an object's function-valued field in ts mode (plan.md §11c T11.4, plan-notes 310):
// typed closures stored in an object literal, called through the object.

function makeStack() {
  const items: number[] = [];
  function push(value: number): number {
    items.push(value);
    return items.length;
  }
  return {
    push,
    pop: (): number | undefined => items.pop(),
    peek: function (): number | undefined {
      return items[items.length - 1];
    },
    size: (): number => items.length,
  };
}

const stack = makeStack();
stack.push(1);
stack.push(2);
console.log(stack.push(3), stack.size(), stack.peek());
console.log(stack.pop(), stack.pop(), stack.size());

const math = { square: (x: number): number => x * x, half: (x: number): number => x / 2 };
console.log(math.square(math.half(10)));

interface Greeter {
  greet: (name: string) => string;
}
const greeter: Greeter = { greet: (name) => `hello, ${name}` };
console.log(greeter.greet("stator"));
