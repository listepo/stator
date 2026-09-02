const p = { x: 1, y: 2 };
const { x, y } = p;
console.log(x + y);
const arr = [1, 2, 3];
const [a, b] = arr;
if (a === undefined || b === undefined) {
  console.log(0);
} else {
  console.log(a + b);
}
function add({ x, y }) {
  return x + y;
}
console.log(add({ x: 3, y: 4 }));
try {
  throw { message: "boom" };
} catch ({ message }) {
  console.log(message);
}
