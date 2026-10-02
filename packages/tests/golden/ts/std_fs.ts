// `std/fs` (docs/STD.md §5): sync, path-only, UTF-8 text files and directories through
// `libjsrt_std.a`. Everything happens under one scratch directory named by the pid, so parallel
// runs never meet, and the fixture removes what it made. Every failure message carries the POSIX
// errno name the oracle reads off Node's `error.code` (golden/std-oracle/fs.ts).
import { mkdir, readText, rmdir, stat, unlink, writeText } from "std/fs";
import { join } from "std/path";
import { pid } from "std/process";

const dir = join("/tmp", `stator_std_fs_${pid()}`);

function attempt(label: string, body: () => void): void {
  try {
    body();
    console.log(label + ": no throw");
  } catch (e) {
    if (e instanceof Error) {
      // The scratch path holds the pid, which differs between the two sides.
      const message = e.message;
      const at = message.indexOf(dir);
      console.log(label + ": " + message.slice(0, at) + "<dir>" + message.slice(at + dir.length));
    }
  }
}

mkdir(dir);
const file = join(dir, "note.txt");
writeText(file, "héllo, std\nline two\n");
console.log(JSON.stringify(readText(file)));
writeText(file, "");
console.log(JSON.stringify(readText(file)));
writeText(file, "€ and 😀");
const text = readText(file);
console.log(text, text.length);

const f = stat(file);
console.log(f.size, f.isFile, f.isDirectory, f.mtimeMs === Math.floor(f.mtimeMs), f.mtimeMs > 0);
const d = stat(dir);
console.log(d.isFile, d.isDirectory);

const missing = join(dir, "missing.txt");
attempt("read missing", () => readText(missing));
attempt("stat missing", () => stat(missing));
attempt("write into missing dir", () => writeText(join(missing, "x.txt"), "x"));
attempt("mkdir existing", () => mkdir(dir));
attempt("mkdir under missing", () => mkdir(join(missing, "sub")));
attempt("rmdir non-empty", () => rmdir(dir));
attempt("rmdir a file", () => rmdir(file));
attempt("unlink missing", () => unlink(missing));

const sub = join(dir, "sub");
mkdir(sub);
console.log(stat(sub).isDirectory);
rmdir(sub);
unlink(file);
rmdir(dir);
attempt("stat removed", () => stat(dir));
