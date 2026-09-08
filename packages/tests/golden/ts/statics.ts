// Static members: one binding per static for the whole program, not a slot in any instance.

class Registry {
  static count = 0;
  static prefix = 'r';
  static entries: string[] = [];

  // Calls a static declared BELOW it -- a forward reference, legal exactly as it is for functions.
  static next(): string {
    return Registry.tag(Registry.count);
  }
  static tag(n: number): string {
    return `${Registry.prefix}${n}`;
  }
  static bump(): void {
    Registry.count++;
  }

  // An instance member and a static may share a name: they are separate namespaces.
  count: number;
  constructor(count: number) {
    this.count = count;
    Registry.entries[Registry.count] = Registry.next();
    Registry.bump();
  }
  describe(): string {
    return `${this.count} of ${Registry.count}`;
  }
}

// Statics are inherited: `Sub.count` is the ONE binding Registry declared, not a copy.
class Sub extends Registry {
  static own = 'sub';
}

console.log(Registry.count);
console.log(Registry.next());
const a = new Registry(10);
const b = new Sub(20);
console.log(Registry.count);
console.log(Sub.count);
console.log(a.count);
console.log(b.count);
console.log(a.describe());
console.log(b.describe());
console.log(Registry.entries);
console.log(Sub.next());
console.log(Sub.own);

Registry.count += 5;
console.log(Registry.count);
Registry.count = 100;
console.log(Registry.tag(Registry.count));
console.log(Registry.prefix.length);
