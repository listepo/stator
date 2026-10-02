/* Builtins coverage dashboard (plan.md §7 Task 4.2) — Porffor-style: the % of each builtin's
 * surface that golden tests prove, rendered on every CI run, with the missing members COUNTED
 * rather than hidden.
 *
 * The table is tests/golden/builtins_coverage.json: member -> golden fixtures exercising it,
 * where an empty list is a surface member that has not landed. Every non-empty claim is verified
 * two ways — the fixture file must exist, and its source must actually mention the member — so
 * the dashboard cannot drift green while the fixtures move on. A builtin counts as implemented
 * when ≥1 golden test exercises it and matches Node; the golden runner enforces the second half.
 *
 * THE DETERMINISM CARVE-OUT (plan.md §7 Task 4.2). A member whose result is nondeterministic by
 * specification — `Math.random`, `Date.now()`, zero-argument `new Date()` — cannot match Node
 * byte-for-byte, ever, so the rule above is unmeetable for it BY CONSTRUCTION. Left alone, such a
 * member counts as missing forever and its namespace can never reach 100%. It is instead written
 * as `{"nondeterministic": "<proof>"}` and left out of the percentage entirely.
 *
 * The marker is not a free pass: the proof it names must exist and must mention the member, the
 * same two-way check a fixture claim gets. The difference is only WHICH proof is accepted — a
 * range or distribution assertion in tests/unit/ instead of a byte-for-byte diff.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Claim, loadClaims, mentionsAccess, percent, verifyClaim } from './coverage-claims.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function loadTable(): Record<string, Record<string, Claim>> {
  return loadClaims(join(HERE, 'builtins_coverage.json'), 'builtins_coverage.json');
}

function main(): void {
  const table = loadTable();
  const problems: string[] = [];
  let landedTotal = 0;
  let surfaceTotal = 0;
  const lines: string[] = [];

  let carvedTotal = 0;
  for (const [namespace, members] of Object.entries(table)) {
    let landed = 0;
    let carved = 0;
    const missing: string[] = [];
    for (const [member, claim] of Object.entries(members)) {
      const spelled = namespace === 'globals' ? member : `${namespace}.${member}`;
      // What a proof must literally contain: a global by its name, a namespace member by its
      // qualified spelling (`Math.floor`), and a PROTOTYPE member by access syntax (`.trim`) —
      // no source ever writes `String.prototype.trim`.
      const mentions =
        namespace === 'globals' || !namespace.endsWith('.prototype')
          ? (source: string): boolean => source.includes(spelled)
          : mentionsAccess(member);
      const verdict = verifyClaim(spelled, claim, mentions, HERE, join(HERE, '..'), problems);
      if (verdict === 'missing') {
        missing.push(member);
      } else if (verdict === 'landed') {
        landed += 1;
      } else {
        carved += 1;
      }
    }
    // Nondeterministic members leave the denominator: they are neither landed nor missing, and
    // counting them either way would make the percentage a lie in one direction or the other.
    const surface = Object.keys(members).length - carved;
    landedTotal += landed;
    surfaceTotal += surface;
    carvedTotal += carved;
    const pct = percent(landed, surface);
    const nd = carved === 0 ? '' : ` [+${String(carved)} nondeterministic]`;
    const tail = missing.length === 0 ? '' : ` — missing: ${missing.join(', ')}`;
    lines.push(
      `  ${namespace}: ${String(landed)}/${String(surface)} (${String(pct)}%)${nd}${tail}`,
    );
  }

  const pct = percent(landedTotal, surfaceTotal);
  const carvedNote =
    carvedTotal === 0 ? '' : `, +${String(carvedTotal)} nondeterministic (proved outside golden)`;
  console.log(
    `builtins: ${String(landedTotal)}/${String(surfaceTotal)} surface members landed (${String(pct)}%)${carvedNote}`,
  );
  for (const line of lines) {
    console.log(line);
  }
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`builtins: STALE CLAIM — ${problem}`);
    }
    process.exit(1);
  }
}

main();
