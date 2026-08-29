// Statics on the dynamic path: an uninitialized static reads undefined, exactly as a field slot
// does, and every static type is unknown without changing what a static IS.

class Counter {
  static total = 0;
  static label;
  static add(n) {
    Counter.total = Counter.total + n;
    return Counter.total;
  }
  static describe() {
    return `${Counter.label}: ${Counter.total}`;
  }
}

class Tagged extends Counter {
  static tag = 't';
}

console.log(Counter.total);
console.log(Counter.label);
console.log(Counter.add(3));
console.log(Counter.add(4));
Counter.label = 'done';
console.log(Counter.describe());
console.log(Tagged.describe());
console.log(Tagged.tag);
Counter.total -= 2;
console.log(Counter.total);
