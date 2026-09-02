let x: number = 1;
let y: number = 0;
let vx: number = 0;
let vy: number = 0.02;
for (let step = 0; step < 200_000; step += 1) {
  const dx = 0 - x;
  const dy = 0 - y;
  const distance = Math.sqrt(dx * dx + dy * dy) + 0.000001;
  const force = 0.0001 / (distance * distance * distance);
  vx = vx + dx * force;
  vy = vy + dy * force;
  x = x + vx;
  y = y + vy;
}
console.log(Math.trunc(x + y));
