// An empty array literal takes its element type from its context (plan-notes 311): an
// annotation, an `as`, a return type, a parameter, an assignment target. Each one starts empty,
// grows, and prints as the array its context names; an arrow typed only by the callback it is
// passed to fills one, which is the shape `std`'s string lists are built in.

function none(): number[] {
  return [];
}

function count(xs: readonly string[]): number {
  return xs.length;
}

function strings(n: number, at: (index: number) => string): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(at(i));
  }
  return out;
}

const out: string[] = [];
out.push('a');
const more = [] as string[];
more.push('b', 'c');
let flags: boolean[];
flags = [];
flags.push(out.length === 1, count([]) === 0);
const nums = none();
nums.push(1.5);
nums.push(-0, 2 ** 53);
const grid: number[][] = [];
grid.push([]);
grid.push([1, 2]);
console.log(out, more, flags, nums, grid);
console.log(out.concat(more).join('-'), nums.length, count([]), grid.length);
console.log(strings(3, (i) => `item${i}`));
console.log(strings(0, (i) => `${i}`), strings(2, (i) => more.slice(i, i + 1).join('')));
