async function loops() {
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const v = await Promise.resolve(i * 10);
    out.push(v);
    const cap = () => i;
    out.push(cap());
  }
  return out.join(',');
}
loops().then(function (r) { console.log('loops ' + r); });
async function nested() {
  const out = [];
  for (let a = 0; a < 2; a += 1) {
    for (let b = 0; b < 2; b += 1) {
      const v = await Promise.resolve(a * 10 + b);
      out.push(v);
      const cap = () => a * 100 + b;
      out.push(cap());
    }
  }
  return out.join(',');
}
nested().then(function (r) { console.log('nested ' + r); });
async function withBreak() {
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    const v = await Promise.resolve(i);
    if (v === 2) { break; }
    out.push(v);
    const cap = () => i;
    out.push(cap());
  }
  return out.join(',');
}
withBreak().then(function (r) { console.log('break ' + r); });
function* gen() {
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const cap = () => i;
    out.push(i);
    yield cap();
  }
  return out.join(',');
}
const g = gen();
const seen = [];
let step = g.next();
while (!step.done) { seen.push(step.value); step = g.next(); }
console.log('gen ' + seen.join(',') + ' ret ' + step.value);
