const p: { x: number; y: number } = { x: 1, y: 2 };
const { x, y } = p;
console.log(x + y);
const arr: number[] = [1, 2, 3];
const [a, b] = arr;
if (a === undefined || b === undefined) {
  console.log(0);
} else {
  console.log(a + b);
}
function addParam({ x, y }: { x: number; y: number }): number {
  return x + y;
}
console.log(addParam({ x: 3, y: 4 }));
