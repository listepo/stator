/** Oracle diff (plan.md §10 Task 7.3 step 6): generated binding vs the hand-written one.
 *
 *  The manual bindings (`examples/ffi/*.d.ts`) are the generator's oracle: regenerate and diff,
 *  and every difference is either a generator bug or a manual-binding bug — resolved, never
 *  tolerated. This module only READS the handwritten file (parsed with the `typescript` package,
 *  no type-checker, no `ts.Type`); matching is by C symbol, which rides the `@statorExtern`
 *  override or defaults to the TS name (docs/FFI.md §1).
 */

import * as ts from 'typescript';
import type { GenResult } from './emit.ts';

export interface HandFunction {
  readonly tsName: string;
  readonly cName: string;
  readonly paramTypes: readonly string[];
  readonly retType: string;
}

function collapseSpaces(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** Every `declare function` in a handwritten binding, with its C symbol resolved. */
export function readHandwritten(sourceText: string, fileName: string): HandFunction[] {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const found: HandFunction[] = [];
  for (const stmt of source.statements) {
    if (!ts.isFunctionDeclaration(stmt) || stmt.name === undefined) {
      continue;
    }
    const tsName = stmt.name.text;
    let cName: string | undefined;
    for (const tag of ts.getJSDocTags(stmt)) {
      if (tag.tagName.text === 'statorExtern' && cName === undefined) {
        const comment = typeof tag.comment === 'string' ? tag.comment : undefined;
        const first = comment?.trim().split(/\s+/, 1)[0];
        cName = first === undefined || first === '' ? tsName : first;
      }
    }
    if (cName === undefined) {
      continue;
    }
    found.push({
      tsName,
      cName,
      paramTypes: stmt.parameters.map((p) =>
        p.type !== undefined ? collapseSpaces(p.type.getText()) : '?',
      ),
      retType: stmt.type !== undefined ? collapseSpaces(stmt.type.getText()) : '?',
    });
  }
  return found;
}

export type DiffStatus =
  | 'match'
  | 'mismatch'
  | 'gen-only'
  | 'hand-only-emittable'
  | 'hand-only-refused';

export interface DiffEntry {
  readonly status: DiffStatus;
  readonly cName: string;
  readonly detail: string;
}

/** Compare by C symbol. `hand-only-refused` (the handwritten file declares what the header
 *  cannot supply — or what the generator refuses) is the interesting row for oracle work:
 *  each one is a generator bug, a manual-binding bug, or a documented rule divergence. */
export function diffBindings(result: GenResult, hand: readonly HandFunction[]): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const genByC = new Map(result.functions.map((fn) => [fn.cName, fn]));
  const refusedByC = new Map(result.refusals.map((r) => [r.construct, r]));
  const handByC = new Map(hand.map((fn) => [fn.cName, fn]));

  const names = new Set<string>([...genByC.keys(), ...handByC.keys()]);
  for (const name of [...names].sort()) {
    const gen = genByC.get(name);
    const handwritten = handByC.get(name);
    if (gen !== undefined && handwritten === undefined) {
      entries.push({
        status: 'gen-only',
        cName: name,
        detail: `generated as ${gen.tsName}(${gen.params.map((p) => p.tsType).join(', ')}): ${gen.ret}`,
      });
    } else if (gen === undefined && handwritten !== undefined) {
      const refused = refusedByC.get(name);
      if (refused !== undefined) {
        entries.push({
          status: 'hand-only-refused',
          cName: name,
          detail: `generator refuses: ${refused.reason}`,
        });
      } else {
        entries.push({
          status: 'hand-only-emittable',
          cName: name,
          detail: `hand-written as ${handwritten.tsName} but no header declaration found (renamed? from another header?)`,
        });
      }
    } else if (gen !== undefined && handwritten !== undefined) {
      const differences: string[] = [];
      if (gen.tsName !== handwritten.tsName) {
        differences.push(`ts-name gen=\`${gen.tsName}\` hand=\`${handwritten.tsName}\``);
      }
      const genParams = gen.params.map((p) => p.tsType).join(', ');
      if (genParams !== handwritten.paramTypes.join(', ')) {
        differences.push(
          `params gen=\`(${genParams})\` hand=\`(${handwritten.paramTypes.join(', ')})\``,
        );
      }
      if (gen.ret !== handwritten.retType) {
        differences.push(`return gen=\`${gen.ret}\` hand=\`${handwritten.retType}\``);
      }
      entries.push({
        status: differences.length === 0 ? 'match' : 'mismatch',
        cName: name,
        detail: differences.length === 0 ? `identical as ${gen.tsName}` : differences.join('; '),
      });
    }
  }
  return entries;
}

export function renderDiffReport(
  entries: readonly DiffEntry[],
  generatedName: string,
  handName: string,
): string {
  const counts = new Map<DiffStatus, number>();
  for (const entry of entries) {
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
  }
  const count = (status: DiffStatus): number => counts.get(status) ?? 0;
  const out: string[] = [];
  out.push(`oracle diff: generated ${generatedName} vs hand-written ${handName}`);
  out.push(
    `${entries.length} C symbols compared: ${count('match')} match, ${count('mismatch')} mismatch, ` +
      `${count('gen-only')} gen-only, ${count('hand-only-emittable')} hand-only-emittable, ` +
      `${count('hand-only-refused')} hand-only-refused`,
  );
  for (const entry of entries) {
    if (entry.status !== 'match') {
      out.push(`  [${entry.status}] ${entry.cName}: ${entry.detail}`);
    }
  }
  return out.join('\n') + '\n';
}
