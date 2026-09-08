console.log(await Promise.resolve(1).then((n: number) => n + 1));
console.log(await Promise.reject("x").catch((e: string) => e));
console.log(
  await Promise.resolve(2).finally(() => {
    console.log("f");
  }),
);
const p = new Promise<number>((resolve) => {
  resolve(3);
});
console.log(await p);
try {
  await Promise.resolve(0).then(() => {
    throw "boom";
  });
} catch (e: unknown) {
  if (typeof e === "string") {
    console.log(e);
  }
}
const q = new Promise<number>((_resolve, _reject) => {
  throw "nope";
});
try {
  await q;
} catch (e: unknown) {
  if (typeof e === "string") {
    console.log(e);
  }
}
