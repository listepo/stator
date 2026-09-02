const source: string = '{"a":1,"b":[2,3,4],"nested":{"ok":true}}';
let checksum: number = 0;
for (let i = 0; i < 100; i += 1) {
  const value: unknown = JSON.parse(source);
  checksum += JSON.stringify(value).length;
}
console.log(checksum);
