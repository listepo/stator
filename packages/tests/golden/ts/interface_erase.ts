// Interfaces and type aliases erase: they bind no value and emit no code,
// so this program prints exactly what Node prints for the same source.
interface Point {
  x: number;
  y: number;
}

type Label = { text: string; at: Point };

function describe(label: Label): string {
  return label.text + " (" + label.at.x + "," + label.at.y + ")";
}

function origin(): Point {
  return { x: 0, y: 0 };
}

function nested(): number {
  interface Box {
    value: number;
  }
  type Wrap = { box: Box };
  const w: Wrap = { box: { value: 41 } };
  return w.box.value + 1;
}

const home: Point = { x: 3, y: 4 };
console.log(describe({ text: "home", at: home }));
console.log(describe({ text: "origin", at: origin() }));
console.log(nested());
