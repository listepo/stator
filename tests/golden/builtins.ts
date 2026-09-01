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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A member is proved either by golden fixtures, or — if no golden test CAN prove it — by a named
 * non-golden proof. `undefined` proof means the member has not landed. */
type Claim =
  | { readonly kind: 'fixtures'; readonly fixtures: readonly string[] }
  | {
      readonly kind: 'nondeterministic';
      readonly proof: string;
    };
type Coverage = Record<string, Record<string, Claim>>;

function parseClaim(where: string, value: unknown): Claim {
  if (Array.isArray(value)) {
    if (value.some((f) => typeof f !== 'string')) {
      throw new Error(`'${where}' must list fixture paths`);
    }
    return { kind: 'fixtures', fixtures: value as readonly string[] };
  }
  if (typeof value === 'object' && value !== null && 'nondeterministic' in value) {
    const proof: unknown = (value as { nondeterministic: unknown }).nondeterministic;
    if (typeof proof !== 'string' || proof === '') {
      throw new Error(`'${where}' must name the proof that stands in for a golden test`);
    }
    return { kind: 'nondeterministic', proof };
  }
  throw new Error(`'${where}' must list fixture paths or be {"nondeterministic": "<proof>"}`);
}

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
    const checked: Record<string, Claim> = {};
    for (const [member, value] of Object.entries(members)) {
      checked[member] = parseClaim(`${namespace}.${member}`, value);
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

  let carvedTotal = 0;
  for (const [namespace, members] of Object.entries(table)) {
    let landed = 0;
    let carved = 0;
    const missing: string[] = [];
    for (const [member, claim] of Object.entries(members)) {
      if (claim.kind === 'fixtures' && claim.fixtures.length === 0) {
        missing.push(member);
        continue;
      }
      const spelled = namespace === 'globals' ? member : `${namespace}.${member}`;
      // What a proof must literally contain: a global by its name, a namespace member by its
      // qualified spelling (`Math.floor`), and a PROTOTYPE member by access syntax (`.trim`) —
      // no source ever writes `String.prototype.trim`. The access form must not be followed by
      // an identifier character, which is what keeps `.trim` from matching inside `.trimStart`;
      // it deliberately does NOT require a paren, because `size` is a property, not a call.
      const mentions =
        namespace === 'globals' || !namespace.endsWith('.prototype')
          ? (source: string): boolean => source.includes(namespace === 'globals' ? member : spelled)
          : (source: string): boolean => new RegExp(`\\.${member}(?![A-Za-z0-9_$])`).test(source);
      // A nondeterministic member is verified exactly as hard as a golden one — the file it names
      // must exist and must mention it. Only the KIND of proof differs, never whether one exists.
      const proofs =
        claim.kind === 'fixtures'
          ? claim.fixtures.map((f) => join(HERE, f))
          : [join(HERE, '..', claim.proof)];
      if (claim.kind === 'fixtures') {
        landed += 1;
      } else {
        carved += 1;
      }
      for (const path of proofs) {
        const shown = claim.kind === 'fixtures' ? path : claim.proof;
        if (!existsSync(path)) {
          problems.push(`${spelled}: proof '${shown}' does not exist`);
        } else if (!mentions(readFileSync(path, 'utf8'))) {
          problems.push(`${spelled}: proof '${shown}' never mentions it`);
        }
      }
    }
    // Nondeterministic members leave the denominator: they are neither landed nor missing, and
    // counting them either way would make the percentage a lie in one direction or the other.
    const surface = Object.keys(members).length - carved;
    landedTotal += landed;
    surfaceTotal += surface;
    carvedTotal += carved;
    const pct = surface === 0 ? 0 : Math.round((landed / surface) * 100);
    const nd = carved === 0 ? '' : ` [+${String(carved)} nondeterministic]`;
    const tail = missing.length === 0 ? '' : ` — missing: ${missing.join(', ')}`;
    lines.push(
      `  ${namespace}: ${String(landed)}/${String(surface)} (${String(pct)}%)${nd}${tail}`,
    );
  }

  const pct = surfaceTotal === 0 ? 0 : Math.round((landedTotal / surfaceTotal) * 100);
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
