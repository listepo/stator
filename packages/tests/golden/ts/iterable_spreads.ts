// Spreads of any iterable, Array.from and call-side spreads in ts mode (plan.md §11c T11.4
// step 5, docs/VALUE.md §4.23).
const m = new Map<number, string>();
m.set(1, 'a');
m.set(2, 'b');
const a = Array.from(m.values());
console.log(a, Array.from('hé😀'), Array.from([1, 2]));
const s = new Set<number>();
s.add(3);
console.log([...m.keys(), ...'xy', ...s], [...m]);
const tz: [number, string] = [1, 'z'];
console.log([...tz, 0]);

function add3(a: number, b: number, c: number): number {
  return a + b + c;
}
function sum(...xs: number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t;
}
const triple: [number, number, number] = [1, 2, 3];
console.log(add3(...triple));
const nums = [4, 5, 6];
console.log(sum(...nums), sum(0, ...nums, 7), sum(...nums, ...nums));
const st = new Set<number>();
st.add(1);
st.add(2);
st.add(2);
st.add(3);
console.log(sum(...st));
class Acc {
  total = 0;
  add(...xs: number[]): number {
    for (const x of xs) this.total += x;
    return this.total;
  }
  static of(...xs: number[]): Acc {
    const a = new Acc();
    a.add(...xs);
    return a;
  }
}
const acc = new Acc();
console.log(acc.add(...nums), acc.add(1, ...[2, 3]), acc.total);
console.log(Acc.of(...nums).total);
const out: number[] = [];
out.push(...nums);
out.push(...nums, 9);
out.unshift(...[0, -1]);
console.log(out, out.length);
const removed = out.splice(1, 2, ...[100, 200, 300]);
console.log(out, removed);
console.log(out.concat(...[[1], [2, 3]]));
const obj = { greet(...names: string[]): string { return 'hi ' + names.join(','); } };
console.log(obj.greet(...['a', 'b']));
const f = (x: number, y: number): number => x * y;
console.log(f(...([3, 4] as const)));
console.log(Math.max(1, 2));
const strs = 'abc';
console.log(sum(...[...strs].map((s) => s.length)));
