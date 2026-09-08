// A getter and a setter are a pair of METHODS under a name no source can spell. So `o.x` is a call
// and `o.x = v` is a call, the property occupies no slot, and util.inspect never prints it -- which
// is the observable difference from a field that happens to be computed in the constructor.

class Rect {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  get area(): number {
    return this.width * this.height;
  }

  // A getter may read another getter, and a setter may write a field the constructor wrote.
  get label(): string {
    return `${this.width}x${this.height}=${this.area}`;
  }

  set square(side: number) {
    this.width = side;
    this.height = side;
  }

  // Read and write halves of ONE property: `o.scale` is the getter, `o.scale = n` the setter.
  get scale(): number {
    return this.width;
  }
  set scale(n: number) {
    this.width = this.width * n;
    this.height = this.height * n;
  }

  grow(): number {
    // From inside the class the accessor is the same call it is from outside.
    this.scale = 2;
    return this.area;
  }
}

const r = new Rect(3, 4);
console.log(r.area);
console.log(r.label);
console.log(r.scale);

r.square = 5;
console.log(r.area);
console.log(r.label);

r.scale = 3;
console.log(r.width);
console.log(r.height);
console.log(r.area);

console.log(r.grow());
console.log(r.label);

// An accessor is not a slot, so it does not print -- only the two fields do.
console.log(r);

// A getter-only property is legal, and a class may be all accessors and no fields.
class Origin {
  get x(): number {
    return 0;
  }
  get y(): number {
    return 0;
  }
}
const o = new Origin();
console.log(o.x + o.y);
console.log(o);

// Accessors are inherited like methods, and a subclass may add its own.
class Cube extends Rect {
  depth: number;
  constructor(side: number) {
    super(side, side);
    this.depth = side;
  }
  get volume(): number {
    return this.area * this.depth;
  }
}
const c = new Cube(2);
console.log(c.area);
console.log(c.volume);
console.log(c.label);
console.log(c);
