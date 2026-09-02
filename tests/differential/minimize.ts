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

  const replacements: readonly [RegExp, string][] = [
    [/\([^()\n]+\)/g, '0'],
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

