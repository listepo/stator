// A CommonJS cycle (plan.md §11d T12.3): b.js sees index.js's exports half built.
import { report } from 'cyc';
console.log(report());
