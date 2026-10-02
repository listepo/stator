// Packages from node_modules through the default adapter (plan.md §11d T12.2): a named import,
// a default import, and one package imported twice under two names.
import fmt from 'fmt';
import { pad, padEnd } from 'leftpad';
import { pad as padLeft } from 'leftpad';

console.log(fmt(pad('7', 3)));
console.log(fmt(padEnd('ab', 4)) + '|');
console.log(padLeft === pad);
console.log(typeof fmt, typeof pad);
