/* Builtins coverage dashboard (plan.md §7 Task 4.2) — Porffor-style: the % of each builtin's
 * surface that golden tests prove, rendered on every CI run, with the missing members COUNTED
 * rather than hidden.
 *
 * The table is tests/golden/builtins_coverage.json: member -> golden fixtures exercising it,
 * where an empty list is a surface member that has not landed. Every non-empty claim is verified
 * two ways — the fixture file must exist, and its source must actually mention the member — so
 * the dashboard cannot drift green while the fixtures move on. A builtin counts as implemented
 * when ≥1 golden test exercises it and matches Node; the golden runner enforces the second half.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

type Coverage = Record<string, Record<string, readonly string[]>>;

function loadTable(): Coverage {
  const raw: unknown = JSON.parse(readFileSync(join(HERE, 'builtins_coverage.json'), 'utf8'));
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('builtins_coverage.json must be an object of namespaces');
  }
  const table: Coverage = {};
  for (const [namespace, members] of Object.entries(raw)) {
    if (namespace.startsWith('_')) {
      continue; // the _comment key documents the format for humans
    }
    if (typeof members !== 'object' || members === null) {
      throw new Error(`namespace '${namespace}' must map members to fixture lists`);
    }
    const checked: Record<string, readonly string[]> = {};
    for (const [member, fixtures] of Object.entries(members)) {
      if (!Array.isArray(fixtures) || fixtures.some((f) => typeof f !== 'string')) {
        throw new Error(`'${namespace}.${member}' must list fixture paths`);
      }
      checked[member] = fixtures as readonly string[];
    }
    table[namespace] = checked;
  }
  return table;
}

function main(): void {
  const table = loadTable();
  const problems: string[] = [];
  let landedTotal = 0;
  let surfaceTotal = 0;
  const lines: string[] = [];

  for (const [namespace, members] of Object.entries(table)) {
    let landed = 0;
    const missing: string[] = [];
    for (const [member, fixtures] of Object.entries(members)) {
      if (fixtures.length === 0) {
        missing.push(member);
        continue;
      }
      landed += 1;
      const spelled = namespace === 'globals' ? member : `${namespace}.${member}`;
      // What a fixture must literally contain: a global by its name, a namespace member by its
      // qualified spelling (`Math.floor`), and a PROTOTYPE member by access syntax (`.trim`) —
      // no source ever writes `String.prototype.trim`. The access form must not be followed by
      // an identifier character, which is what keeps `.trim` from matching inside `.trimStart`;
      // it deliberately does NOT require a paren, because `size` is a property, not a call.
      const mentions =
        namespace === 'globals' || !namespace.endsWith('.prototype')
          ? (source: string): boolean => source.includes(namespace === 'globals' ? member : spelled)
          : (source: string): boolean => new RegExp(`\\.${member}(?![A-Za-z0-9_$])`).test(source);
      for (const fixture of fixtures) {
        const path = join(HERE, fixture);
        if (!existsSync(path)) {
          problems.push(`${spelled}: fixture '${fixture}' does not exist`);
        } else if (!mentions(readFileSync(path, 'utf8'))) {
          problems.push(`${spelled}: fixture '${fixture}' never mentions it`);
        }
      }
    }
    const surface = Object.keys(members).length;
    landedTotal += landed;
    surfaceTotal += surface;
    const pct = surface === 0 ? 0 : Math.round((landed / surface) * 100);
    const tail = missing.length === 0 ? '' : ` — missing: ${missing.join(', ')}`;
    lines.push(`  ${namespace}: ${String(landed)}/${String(surface)} (${String(pct)}%)${tail}`);
  }

  const pct = surfaceTotal === 0 ? 0 : Math.round((landedTotal / surfaceTotal) * 100);
  console.log(
    `builtins: ${String(landedTotal)}/${String(surfaceTotal)} surface members landed (${String(pct)}%)`,
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
