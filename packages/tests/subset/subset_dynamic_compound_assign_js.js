// @mode: js
// @verdict: dynamic
// SUBSET.md: Compound assignment to a member of a dynamic receiver

// Every compound, logical and update form on a receiver the compiler only knows as Unknown: the
// place is the receiver's shape-table entry, read and written through a receiver evaluated once.
const counts = JSON.parse('{"hits": 1, "label": "x", "missing": null}');
counts.hits += 2;
counts.hits *= 3;
counts.label ||= 'y';
counts.missing ??= 'filled';
counts.hits++;
--counts.hits;
export const result = (counts.hits -= 1);
