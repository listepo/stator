// @mode: ts
// @verdict: dynamic
// SUBSET.md: Compound assignment to a member of a dynamic receiver

// An optional property routes the members through the shape table in ts mode too, so the
// compound and update forms read and write the same entry.
interface Counts {
  hits: number;
  label?: string;
}
const counts: Counts = { hits: 1 };
counts.hits += 2;
counts.hits *= 3;
counts.hits++;
--counts.hits;
export const result = (counts.hits -= 1);
