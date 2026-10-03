// node:path/posix under --node (plan.md §11c T11.6): the same module object as node:path.
import posixPath, {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  posix,
  relative,
  resolve,
  sep,
  toNamespacedPath,
} from 'node:path/posix';

console.log(basename('/a/b.js', '.js'), dirname('/a/b'), extname('b.js'), isAbsolute('/'));
console.log(join('a', '../b'), normalize('a//b/./c'), relative('/a/b', '/a/c/d'));
console.log(resolve('/a', 'b') === posixPath.resolve('/a/b'), sep, delimiter);
console.log(toNamespacedPath('x'), format(parse('/r/s.t')), posix === posixPath);
console.log(posixPath.join('x', 'y'), posix.basename('/q/'));
