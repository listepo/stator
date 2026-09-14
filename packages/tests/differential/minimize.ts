/* Delta-debugging helpers for differential findings (plan.md §9 Task 6.2). */

export type DivergencePredicate = (source: string) => boolean;

/** Drop complete statements first, then shrink expression tokens. The predicate is rerun after
 * every accepted reduction, so the returned source is always a reproducer. */
export function minimizeProgram(source: string, preserves: DivergencePredicate): string {
  let current = source;
  let changed = true;
  while (changed) {
    changed = false;
    const statements = current.split('\n').filter((line) => line.trim() !== '');
    for (let i = 0; i < statements.length; i += 1) {
      const candidate = `${statements.slice(0, i).concat(statements.slice(i + 1)).join('\n')}\n`;
      if (candidate.trim() !== '' && preserves(candidate)) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }

  // The parenthesised rewrite shrinks grouping parentheses only. A `(` preceded by an
  // identifier character is a call (`console.log(0)`, `Math.trunc(x)`), and rewriting it produces
  // `console.log0` — not a reproducer. Control-flow parentheses (`for (...)`) still match, but a
  // broken candidate fails the predicate, so it is never accepted.
  const replacements: readonly [RegExp, string][] = [
    [/(?<![A-Za-z0-9_$])\([^()\n]+\)/g, '0'],
    [/\[[^\]\n]*\]/g, '[]'],
    [/"(?:[^"\\]|\\.)*"/g, '""'],
    [/\b-?\d+(?:\.\d+)?\b/g, '0'],
  ];
  for (const [pattern, replacement] of replacements) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(current)) !== null) {
      const candidate = `${current.slice(0, match.index)}${replacement}${current.slice(match.index + match[0].length)}`;
      if (candidate !== current && preserves(candidate)) {
        current = candidate;
        pattern.lastIndex = 0;
      }
    }
    pattern.lastIndex = 0;
  }
  return current;
}

