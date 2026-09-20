// Phase 5 step 12(d), slice 1 (plan-notes 233): the class members that declare a shape and no code
// -- constructor and method overload signatures, an abstract method, `x?: T`, `m?() {}` and a bodiless
// `m?(): T` -- and a derived constructor whose `super(...)` is not its first statement or sits in both
// branches of an if/else. The field initializers must run right after the base constructor on every
// path, which the log order shows.

const log: string[] = [];

abstract class Shape {
  sides: number;
  label = `shape#${log.push('Shape field')}`;
  constructor(sides: number) {
    log.push('Shape ctor');
    this.sides = sides;
  }
  abstract area(): number;
  describe(): string {
    return `${this.sides} sides, area ${this.area()}`;
  }
}

abstract class Polygon extends Shape {
  corners(): number {
    return this.sides;
  }
}

class Square extends Polygon {
  side: number;
  doubled = this.sides * 2;
  constructor(side: number);
  constructor(side: number, scale: number);
  constructor(side: number, scale?: number) {
    const s = scale === undefined ? side : side * scale;
    log.push('Square before super');
    super(4);
    log.push('Square after super');
    this.side = s;
  }
  area(): number {
    return this.side * this.side;
  }
}

class Tri extends Polygon {
  kind: string;
  tag = log.push('Tri field');
  constructor(equilateral: boolean) {
    if (equilateral) {
      super(3);
      this.kind = 'equilateral';
    } else {
      log.push('scalene first');
      super(3);
      this.kind = 'scalene';
    }
  }
  area(): number {
    return 1.5;
  }
}

class Formatter {
  prefix?: string;
  count = 0;
  format(n: number): string;
  format(s: string): string;
  format(v: number | string): string {
    this.count++;
    return `${this.prefix ?? '<'}${v}>`;
  }
  reset?(): void;
  greet?(): string {
    return 'hi';
  }
}

const sq = new Square(3, 2);
const tri = new Tri(false);
const eq = new Tri(true);
console.log(sq);
console.log(tri);
console.log(`${eq.kind} ${sq.corners()} ${tri.corners()}`);
const shapes: Shape[] = [sq, tri, eq];
for (const s of shapes) {
  console.log(s.describe());
}
console.log(log.join(' | '));

const f = new Formatter();
console.log(f);
console.log(`${f.format(1)} ${f.format('two')}`);
f.prefix = '[';
console.log(`${f.format(3)} ${f.count}`);
console.log(f.reset);
console.log(f.reset?.() === undefined);
console.log(f.greet?.());
console.log(f);
