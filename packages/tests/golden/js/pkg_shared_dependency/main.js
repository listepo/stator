// Two packages that share a dependency get ONE instance of it in the vendor bundle, as under
// Node: the counter both of them advance is the same counter (plan.md §11d T12.2).
import { a } from 'pkg-a';
import { b } from 'pkg-b';
import { next, peek } from 'counter';

console.log(a(), b(), a());
console.log(next(), peek());
