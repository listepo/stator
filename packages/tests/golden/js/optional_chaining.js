// plan.md §8 step 24: optional chaining in js mode — untyped receivers guard the same way,
// a nullish base skips keys, arguments and the rest of the chain, and a plain link above a
// `?.` still throws a catchable TypeError.
let calls = 0;
function key(k) {
  calls += 1;
  return k;
}

function prop(o) {
  console.log(o?.a?.b);
  console.log(o?.a?.b ?? 7);
}

prop(undefined);
prop(null);
prop({});
prop({ a: {} });
prop({ a: { b: 3 } });

function element(o) {
  calls = 0;
  console.log(o?.[key("a")] ?? "skipped");
  console.log(calls);
}

element(undefined);
element({ a: 1 });

function twice(x) {
  return x * 2;
}

function arg(x) {
  calls += 1;
  return x;
}

function callit(f) {
  calls = 0;
  console.log(f?.(arg(21)) ?? "nocall");
  console.log(calls);
}

callit(undefined);
callit(null);
callit(twice);

function tail(q) {
  try {
    console.log(q.a?.b?.c);
  } catch (e) {
    console.log("threw:" + e.name);
  }
  try {
    console.log(q.a?.b.c);
  } catch (e) {
    console.log("threw:" + e.name);
  }
}

tail({});
tail({ a: {} });
tail({ a: { b: {} } });
tail({ a: { b: { c: 1 } } });

function cond(o) {
  if (o?.a) {
    console.log("truthy");
  } else {
    console.log("falsy");
  }
}

cond(undefined);
cond({});
cond({ a: 5 });
