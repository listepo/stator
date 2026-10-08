// Untyped: the checker infers `{ name: string; size: number }`, and the module grows each object
// past that type (docs/VALUE.md §4.24).
export function openFile(name) {
  const file = { name, size: 0 };
  file.isOpen = true;
  file.handle = name.length;
  return file;
}
