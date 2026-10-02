// node:fs in js mode under --node (plan.md §11c T11.6): the bare specifier, the default export,
// untyped arguments crossing into the typed module, and a SystemError read as a plain object.
import fs from 'fs';
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';

const dir = `/tmp/stator_node_fs_js_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
mkdirSync(dir);
const file = `${dir}/notes.txt`;
const lines = ['alpha', 'beta', 'gamma'];
writeFileSync(file, lines.join('\n'));
const text = readFileSync(file, { encoding: 'utf8' });
console.log(text.split('\n').length, text.length, fs.statSync(file).size);
console.log(fs.readdirSync(dir), existsSync(file));
const options = { encoding: 'hex' };
console.log(readFileSync(file, options).slice(0, 10));
try {
  fs.unlinkSync(`${dir}/none`);
} catch (e) {
  console.log(e.code, e.syscall, e.errno !== undefined);
}
fs.unlinkSync(file);
rmdirSync(dir);
console.log(existsSync(dir));
