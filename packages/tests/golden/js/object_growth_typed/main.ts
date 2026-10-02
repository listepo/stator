// The grown names travel with the object into typed code: a typed module cannot name them (its
// checker says TS2339), but printing, `Object.keys`, JSON and object spread see them, after the
// declared names.
import { openFile } from './lib.js';

const f = openFile('main.ts');
console.log(f.name, f.size);
console.log(f);
console.log(Object.keys(f), JSON.stringify(f));
const copy = { ...f, size: 10 };
console.log(copy);
console.log(Object.keys(copy));
