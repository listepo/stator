
// `console.table` (§ console "table"). The layout is a box-drawn grid: a leading `(index)` column,
// one column per key seen across the rows in FIRST-SEEN order, and a trailing `Values` column for
// rows that are not objects. A cell is one space, the content, padding to the column width, one
// more space -- so every divider segment is the column width plus two.
console.table([
  { a: 1, b: 2 },
  { a: 3, c: 'x' },
]);

// A row that is not an object goes under `Values`; a mixed array gets both kinds of column, and
// each row fills only the cells it has. Note the cells are INSPECT form -- a string is quoted --
// while the index label is not, because a key is not a value.
console.table([1, 'two', true, null]);

// An object argument indexes by its own keys instead of by position, in the same enumeration
// order `Object.entries` fixes for both layouts.
console.table({ r1: { a: 1 }, r2: { a: 2, b: 3 } });
console.table({ a: 1, b: 'two' });

// An ARRAY row's keys are its indices, which is why a table of pairs gets columns `0` and `1`.
console.table([
  [1, 2],
  [3, 4],
]);

// The empty table still draws its header: three rules and one header row, no data rows.
console.table([]);

// A column is as wide as its widest cell, header included, and a cell that inspects to a nested
// form is still one cell.
console.table([{ a: 'wide string here' }, { a: 1 }]);
console.table([{ a: [1, 2] }, { a: { k: 1 } }]);

// Anything that is not a collection of rows falls back to console.log -- Node's own rule.
console.table('scalar');
console.table(undefined);

// A table inside a group is indented like every other console write: the indent goes in front of
// EVERY line, not just the first.
console.group('G');
console.table([{ a: 1 }]);
console.groupEnd();
