let value: string = '';
for (let i = 0; i < 20_000; i += 1) {
  value += `${i % 10}`;
  if (value.length > 1000) value = value.slice(500);
}
console.log(value.length);
