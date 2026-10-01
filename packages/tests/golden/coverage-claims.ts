/* Coverage claims shared by the builtins dashboard (builtins.ts, plan.md §7 Task 4.2) and the Node
 * API dashboard (node-coverage.ts, plan.md §11c). A claim says which proof shows a surface member
 * works: golden fixtures (paths relative to tests/golden/), or — for a member whose result is
 * nondeterministic by specification — a named non-golden proof (path relative to tests/). An
 * EMPTY fixture list is a member that has not landed: counted against coverage, never hidden.
 *
 * Every claim is verified the same two ways whichever kind it is: the proof file must exist, and
 * its source must mention the member. That is what keeps a dashboard from drifting green while
 * the fixtures move on. Only WHICH proof is accepted differs, never whether one exists.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A member is proved either by golden fixtures, or — if no golden test CAN prove it — by a named
 * non-golden proof. An empty fixture list means the member has not landed. */
export type Claim =
  | { readonly kind: 'fixtures'; readonly fixtures: readonly string[] }
  | {
      readonly kind: 'nondeterministic';
      readonly proof: string;
    };

/** One member's verdict: landed (proved by fixtures), carved (nondeterministic — leaves the
 * denominator, because counting it either way would make the percentage a lie), or missing. */
export type Verdict = 'landed' | 'carved' | 'missing';

export function parseClaim(where: string, value: unknown): Claim {
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

/** Reads a `{ namespace: { member: claim } }` table; `_`-prefixed top-level keys document the
 * format for humans and are skipped. */
export function loadClaims(path: string, name: string): Record<string, Record<string, Claim>> {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${name} must be an object of namespaces`);
  }
  const table: Record<string, Record<string, Claim>> = {};
  for (const [namespace, members] of Object.entries(raw)) {
    if (namespace.startsWith('_')) {
      continue;
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

/** Verifies one claim against its proofs and returns its verdict; every broken proof is pushed to
 * `problems` as `<spelled>: …`. `goldenRoot` is tests/golden/, `testsRoot` is tests/. */
export function verifyClaim(
  spelled: string,
  claim: Claim,
  mentions: (source: string) => boolean,
  goldenRoot: string,
  testsRoot: string,
  problems: string[],
): Verdict {
  if (claim.kind === 'fixtures' && claim.fixtures.length === 0) {
    return 'missing';
  }
  const proofs =
    claim.kind === 'fixtures'
      ? claim.fixtures.map((f) => ({ path: join(goldenRoot, f), shown: join(goldenRoot, f) }))
      : [{ path: join(testsRoot, claim.proof), shown: claim.proof }];
  for (const { path, shown } of proofs) {
    if (!existsSync(path)) {
      problems.push(`${spelled}: proof '${shown}' does not exist`);
    } else if (!mentions(readFileSync(path, 'utf8'))) {
      problems.push(`${spelled}: proof '${shown}' never mentions it`);
    }
  }
  return claim.kind === 'fixtures' ? 'landed' : 'carved';
}

/** Access syntax for a prototype member: `.trim` not followed by an identifier character, which
 * keeps `.trim` from matching inside `.trimStart`; no paren required, so properties check too. */
export function mentionsAccess(member: string): (source: string) => boolean {
  const re = new RegExp(`\\.${member.replace(/\$/g, '\\$')}(?![A-Za-z0-9_$])`);
  return (source) => re.test(source);
}

export function percent(landed: number, surface: number): number {
  return surface === 0 ? 0 : Math.round((landed / surface) * 100);
}
