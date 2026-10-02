// node:path (posix) under --node (plan.md §11c T11.6): every landed member against the pinned
// Node, byte for byte. Nothing printed depends on the working directory.
import path, {
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
} from 'node:path';

function show(label: string, value: string): void {
  console.log(`${label} ${JSON.stringify(value)}`);
}

show('join', join('/a/b', '../c', './d/'));
show('join()', join());
show('join empty', join('', ''));
show('join skips empty', join('a', '', 'b'));
show('join dots', join('a', '..', '..', 'b'));
show('normalize', normalize('/foo/bar//baz/asdf/quux/..'));
show('normalize empty', normalize(''));
show('normalize ./', normalize('./'));
show('normalize above', normalize('../../a/..'));
show('normalize root dots', normalize('/../a/./b/'));
show('normalize ...', normalize('a/.../b'));
show('basename', basename('/a/b/c.txt'));
show('basename suffix', basename('/a/b/c.txt', '.txt'));
show('basename root', basename('/'));
show('basename trailing', basename('a/'));
show('basename suffix overlap', basename('aaa', 'a'));
show('basename suffix whole', basename('a.txt', 'a.txt'));
show('basename suffix miss', basename('/x/file.js', '.ts'));
show('dirname', dirname('/a/b/'));
show('dirname relative', dirname('a'));
show('dirname root', dirname('/'));
show('dirname double', dirname('//a'));
show('dirname empty', dirname(''));
show('extname', extname('index.html'));
show('extname last', extname('index.coffee.md'));
show('extname dot end', extname('index.'));
show('extname none', extname('index'));
show('extname dotfile', extname('.index'));
show('extname dotfile ext', extname('.index.md'));
show('extname dotdot', extname('..'));
console.log('isAbsolute', isAbsolute('/x'), isAbsolute('x'), isAbsolute(''));
show('relative', relative('/data/orandea/test/aaa', '/data/orandea/impl/bbb'));
show('relative same', relative('/a', '/a'));
show('relative from root', relative('/', '/x'));
show('relative to root', relative('/x/y', '/'));
show('relative prefix', relative('/foo/bar', '/foo/bar/baz'));
show('relative up', relative('/foo/bar/baz', '/foo/bar'));
show('resolve', resolve('/foo/bar', './baz'));
show('resolve absolute wins', resolve('/foo/bar', '/tmp/file/'));
show('resolve above root', resolve('/a', '..', '..', 'b'));
console.log('resolve cwd', resolve() === resolve('.'), resolve('x') === join(resolve(), 'x'));
console.log('resolve absolute', isAbsolute(resolve('')), isAbsolute(resolve('a', 'b')));
const p = parse('/home/user/dir/file.txt');
console.log('parse', JSON.stringify([p.root, p.dir, p.base, p.ext, p.name]));
const q = parse('./.bashrc');
console.log('parse dotfile', JSON.stringify([q.root, q.dir, q.base, q.ext, q.name]));
const r = parse('/');
console.log('parse root', JSON.stringify([r.root, r.dir, r.base, r.ext, r.name]));
const t = parse('a/b.tar.gz/');
console.log('parse trailing', JSON.stringify([t.root, t.dir, t.base, t.ext, t.name]));
show('format dir', format({ root: '/ignored', dir: '/home/user/dir', base: 'file.txt' }));
show('format root', format({ root: '/', base: 'file.txt', ext: 'ignored' }));
show('format name ext', format({ root: '/', name: 'file', ext: 'txt' }));
show('format dotted ext', format({ name: 'file', ext: '.txt' }));
show('format round trip', format(parse('/home/user/dir/file.txt')));
show('sep', sep);
show('delimiter', delimiter);
show('toNamespacedPath', toNamespacedPath('/a/../b'));
show('default join', path.join('a', 'b'));
show('default sep', path.sep);
show('posix basename', posix.basename('/x/y'));
show('posix.posix', path.posix.posix.dirname('/x/y'));
const { join: joinOf, relative: relativeOf } = path;
show('destructured', joinOf('p', relativeOf('/a/b', '/a/c')));
