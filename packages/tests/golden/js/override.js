// Overriding on the dynamic path. Nothing about the table is typed: the slot comes from the class
// the checker built out of the constructor's assignments, exactly as an untyped field's does.

class Node {
  constructor(label) {
    this.label = label;
  }
  render() {
    return `[${this.label}]`;
  }
  wrap() {
    return `<${this.render()}>`;
  }
}

class Loud extends Node {
  render() {
    return `${super.render()}!`;
  }
}

class Quiet extends Loud {
  render() {
    return `${super.render()}?`;
  }
  wrap() {
    return `(${super.wrap()})`;
  }
}

const nodes = [new Node('a'), new Loud('bb'), new Quiet('ccc')];
for (const n of nodes) {
  console.log(n.render());
}
for (const n of nodes) {
  console.log(n.wrap());
}
console.log(nodes[2]);

const q = new Quiet('dddd');
console.log(q.render());
console.log(q.wrap());
console.log(q instanceof Node);
