console.log(await Promise.resolve(1).then((n) => n + 1));
console.log(await Promise.reject("x").catch((e) => e));
console.log(
  await Promise.resolve(2).finally(() => {
    console.log("f");
  }),
);
const p = new Promise((resolve) => {
  resolve(3);
});
console.log(await p);
try {
  await Promise.resolve(0).then(() => {
    throw "boom";
  });
} catch (e) {
  if (typeof e === "string") {
    console.log(e);
  }
}
const q = new Promise((_resolve, _reject) => {
  throw "nope";
});
try {
  await q;
} catch (e) {
  if (typeof e === "string") {
    console.log(e);
  }
}
