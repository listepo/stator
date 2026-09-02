// Collector regression (plan-notes 163): a runtime function that allocates twice must keep the
// first block alive across the second allocation's collection. A Map's grow (entries, then index)
// and an array's construction (header, then elements) both do; the string churn between rounds
// is what makes a collection land inside them. Before the fix this printed varying totals and
// segfaulted about one run in three.
class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

function round(n: number): number {
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    arr.push((i * 7) % 1000);
  }
  let sum = 0;
  for (const v of arr) {
    sum += v;
  }
  const m = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const k = i % 5000;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  let wrong = 0;
  for (let i = 0; i < 5000; i++) {
    if (m.get(i) !== n / 5000) {
      wrong++;
    }
  }
  let s = '';
  for (let i = 0; i < 20000; i++) {
    s += `${i % 10}`;
  }
  const pts: Point[] = [];
  for (let i = 0; i < n / 10; i++) {
    pts.push(new Point(i, i * 2));
  }
  let acc = 0;
  for (const p of pts) {
    acc += p.x + p.y;
  }
  return sum + m.size + wrong + s.length + acc;
}

let total = 0;
for (let r = 0; r < 20; r++) {
  total += round(200000);
}
console.log(total);
