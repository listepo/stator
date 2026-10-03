// The builtin constructors in ts mode (plan.md §11c T11.4 step 4b): an `unknown[]` may hold
// holes, a RegExp can be built from a string, and WeakMap/WeakSet take object keys.

const xs = new Array<unknown>(3);
xs[4] = 'last';
delete xs[4];
xs[1] = 2;
console.log(xs, xs.length, 0 in xs, 1 in xs, xs[0] === undefined);

function compile(source: string, flags: string): RegExp {
  return new RegExp(source, flags);
}
const re = compile('(\\d+)-(\\d+)', 'g');
console.log(re, re.flags, '1-2 3-4'.replace(re, '$2-$1'));
console.log(RegExp('a/b').source, new RegExp(re).lastIndex, new RegExp(re, 'y').flags);
try {
  compile('[', '');
} catch (err) {
  console.log(err instanceof SyntaxError);
}

class Node2 {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
}
const seen = new WeakSet<Node2>();
const depth = new WeakMap<Node2, number>();
const root = new Node2('root');
seen.add(root);
depth.set(root, 0);
console.log(seen.has(root), seen.has(new Node2('x')), depth.has(root), depth);

// A RegExp reached by narrowing is an Unknown receiver: its methods and data properties come
// from the runtime (plan-notes 314).
function describe(x: unknown): void {
  if (x instanceof RegExp) {
    console.log(x.source, x.flags, x.global, x.exec('xaby'), x.lastIndex, x.test('ab'), x.toString());
  }
}
describe(new RegExp('a(b)', 'g'));
function probe(x: string | RegExp): boolean {
  return typeof x === 'string' ? x.length > 0 : x.test('abc');
}
console.log(probe(/c$/), probe(/^z/), probe(''));
