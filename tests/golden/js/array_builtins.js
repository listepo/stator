// Array.prototype in js mode: element types are inferred from the literals, so the same closed-set
// ops land with no annotation anywhere.

const xs = [3, 1, 4, 1, 5];
console.log(xs.push(9));
console.log(xs.pop());
console.log(xs.shift());
console.log(xs.unshift(0));
console.log(xs);
console.log(xs.at(-1));
console.log(xs.indexOf(1, 2));
console.log(xs.lastIndexOf(1));
console.log(xs.includes(4));
console.log([1, NaN].includes(NaN));
console.log([1, NaN].indexOf(NaN));
console.log(xs.join("-"));
console.log(xs.slice(1, -1));
console.log(xs.concat([7, 8]));
console.log([1, 2, 3].reverse());
console.log([0, 0, 0].fill(7, 1));
