// Definite assignment in ts mode: the same discipline as the js-mode
// `definite_assignment` fixture, but every binding is assigned before it is read,
// so no use precedes an assignment and the checker's TS2454 never fires.
let x: number;
x = 2;
console.log(x);
console.log(x + 1);

let f: () => number;
f = () => 7;
console.log(f?.());

class C {
  m(): number {
    return 1;
  }
}
let o: C;
o = new C();
console.log(o.m());

let a: number[];
a = [1, 2];
a.push(3);
console.log(a.length);
console.log(a[2]);

let s: string;
s = 'abc';
console.log(s.length);
