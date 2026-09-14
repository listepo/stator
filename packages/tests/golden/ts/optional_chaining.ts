// plan.md §8 step 24: optional chaining answers Node's undefined/short-circuit at every
// position — `?.`, `?.[]` and `?.()` guard their own base, computed keys and call arguments
// do not evaluate on short-circuit, and a nested `?.` guards its own base too.
type Outer = { a?: { b?: number } };

function prop(o: Outer | undefined): void {
  console.log(o?.a?.b);
  console.log(o?.a?.b ?? 7);
}

prop(undefined);
prop({});
prop({ a: {} });
prop({ a: { b: 3 } });

let calls = 0;
function key(k: string): string {
  calls += 1;
  return k;
}

function element(o: { [k: string]: number } | undefined): void {
  calls = 0;
  console.log(o?.[key("a")] ?? "skipped");
  console.log(calls);
}

element(undefined);
element({ a: 1 });

function twice(x: number): number {
  return x * 2;
}

function arg(x: number): number {
  calls += 1;
  return x;
}

function callit(f: ((x: number) => number) | undefined): void {
  calls = 0;
  console.log(f?.(arg(21)) ?? "nocall");
  console.log(calls);
}

callit(undefined);
callit(twice);

function method(o: { m: (x: number) => number } | undefined): void {
  console.log(o?.m(3) ?? "nom");
}

method(undefined);
method({ m: twice });

function shapes(arr: number[] | undefined, s: string | undefined): void {
  console.log(arr?.length ?? "nolen");
  console.log(arr?.[1] ?? "noidx");
  console.log(s?.length ?? "nolen");
}

shapes([10, 20], "hi");
shapes(undefined, undefined);

function cond(o: { a?: number } | undefined): void {
  if (o?.a) {
    console.log("truthy");
  } else {
    console.log("falsy");
  }
  console.log(`v=${o?.a ?? "none"}`);
}

cond(undefined);
cond({});
cond({ a: 5 });

function nested(q: { a?: { b?: { c?: number } } }): void {
  console.log(q.a?.b?.c);
}

nested({});
nested({ a: {} });
nested({ a: { b: {} } });
nested({ a: { b: { c: 1 } } });
