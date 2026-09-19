// Node-side bindings for the std_path golden (packages/tests/golden/run.ts): the same
// edges the Stator entry calls as fixture-C shims, spelled in JS. The entry calls the
// shims directly (no wrapper module), so the oracle runs the same file with these
// globals DEFINED — the extern_ptr/node_shim.mjs channel. A divergence in the C
// walkers still fails the diff because both sides print the same ten lines.
globalThis.stdPathIsAbsolute = (path) => (path.startsWith("/") ? 1 : 0);
globalThis.stdPathBasename = (path) => {
  if (path === "") return "";
  let end = path.length;
  while (end > 1 && path[end - 1] === "/") end--;
  if (path.slice(0, end) === "/") return "/";
  const slash = path.lastIndexOf("/", end - 1);
  return path.slice(slash + 1, end);
};
globalThis.stdPathDirname = (path) => {
  if (path === "") return ".";
  let end = path.length;
  while (end > 1 && path[end - 1] === "/") end--;
  const slash = path.lastIndexOf("/", end - 1);
  if (slash < 0) return ".";
  if (slash === 0) return "/";
  return path.slice(0, slash);
};
globalThis.stdPathJoinTwo = (a, b) => {
  if (b.startsWith("/")) return b;
  const left = a.replace(/\/+$/, "");
  const right = b.replace(/^\/+/, "");
  return left + "/" + right;
};
