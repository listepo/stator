// Dynamic objects in js mode: the optional shape comes from JSDoc, which the checker honors in a
// .js file, so the same shape-table path runs with no TypeScript syntax in sight.

/** @type {{ x?: number, y?: number }} */
const point = { x: 1 };
console.log(point);
console.log(point.x);
console.log(point.y);

point.y = 2;
console.log(point);

/** @type {{ tag?: string }} */
const empty = {};
console.log(empty);
empty.tag = "widget";
console.log(empty.tag);
console.log(empty);
