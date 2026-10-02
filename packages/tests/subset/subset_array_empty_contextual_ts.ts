// @mode: ts
// @verdict: static
// SUBSET.md: Arrays: an empty literal takes its element type from context (plan-notes 322).
// `[]` alone is the checker's `never[]`; under an array annotation, an `as`, a return type or a
// parameter it is that array, so no Unknown element reaches the module.

function none(): number[] {
  return [];
}

function count(xs: readonly string[]): number {
  return xs.length;
}

export function collect(): string[] {
  const out: string[] = [];
  out.push('a');
  const more = [] as string[];
  more.push('b');
  let flags: boolean[];
  flags = [];
  flags.push(out.length === count([]));
  const nums = none();
  nums.push(1);
  return out.concat(more);
}
