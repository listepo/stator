// Template literals. Substitution is defined as ToString of the hole's value — which is why the
// HIR keeps a TemplateLiteral node instead of desugaring to `+`: the two agree on primitives and
// will diverge at objects, where `+` consults valueOf first.
const name: string = 'world';
const n: number = 42;

console.log(`hello`);
console.log(`hello ${name}`);
console.log(`${name} hello`);
console.log(`${name}`);
console.log(``);

// Adjacent holes with no text between them, and text on both ends.
console.log(`${name}${n}`);
console.log(`a${n}b${n}c`);

// Every primitive stringifies the way ToString says, not the way console.log would: -0 prints as
// "0" inside a template but as "-0" on its own (docs/VALUE.md §3.3).
console.log(`${-0}`);
console.log(-0);
console.log(`${true}`);
console.log(`${null}`);
console.log(`${undefined}`);
console.log(`${0 / 0}`);
console.log(`${1 / 0}`);
console.log(`${1e21}`);
console.log(`${0.1 + 0.2}`);

// Holes hold expressions, not just names.
console.log(`sum ${n + 1}`);
console.log(`cmp ${n > 1}`);
console.log(`len ${name.length}`);
console.log(`nested ${`inner ${n}`}`);

// Escapes inside the literal chunks.
console.log(`tab\there`);
console.log(`quote"here`);
console.log(`back\\slash`);
