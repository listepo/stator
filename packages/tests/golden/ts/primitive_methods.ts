// A `function` stored in an object literal has a dynamic `this`, so `this.name` and `this.count`
// are Unknown whatever the checker infers, and their methods are dynamic method calls that the
// runtime answers with the primitive's bound method (plan-notes 310).
const person = {
  name: "ada",
  count: 6.25,
  shout: function (): string {
    return this.name.toUpperCase() + "!";
  },
  padded: function (): string {
    return this.name.padStart(6, ".") + "|" + this.name.slice(1);
  },
  digits: function (): string {
    return this.count.toFixed(1) + " " + this.count.toString(2);
  },
};
console.log(person.shout());
console.log(person.padded());
console.log(person.digits());
