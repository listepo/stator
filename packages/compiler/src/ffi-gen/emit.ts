/** The deterministic `.d.ts` printer (plan.md §10 Task 7.3 step 4; same rule as 7.2 step 8):
 *  stable ordering (functions by C name, brands by alias, refusals by line), no timestamps,
 *  no absolute paths — same input, byte-identical output. Refusals print as a trailing comment
 *  block (the manual bindings' REFUSED sections, machine-written) and to stderr with the
 *  summary line `N emitted, M refused per reason`.
 */

import type { FunctionRefusal, MappedFunction } from './abi.ts';
import { classifyFunction } from './abi.ts';
import type { HeaderModel } from './model.ts';

export interface Brand {
  readonly alias: string;
  readonly tag: string;
}

export interface Refusal {
  readonly line: number;
  readonly construct: string;
  readonly kind: string;
  readonly reason: string;
  readonly code: string | undefined;
}

export interface GenResult {
  readonly basename: string;
  readonly functions: readonly MappedFunction[];
  readonly brands: readonly Brand[];
  readonly usesCString: boolean;
  readonly usesOutAlias: boolean;
  readonly intWidened: boolean;
  readonly sizeWidened: boolean;
  readonly refusals: readonly Refusal[];
}

function refusalSuffix(refusal: Refusal): string {
  return refusal.code !== undefined
    ? ` [would-be ${refusal.code}]`
    : ' [no STA code allocated yet]';
}

function refusalWhere(basename: string, refusal: Refusal): string {
  return refusal.line > 0 ? `${basename}:${refusal.line}` : basename;
}

/** One refusal as a `.d.ts` comment line (the trailing REFUSED block). */
export function refusalComment(basename: string, refusal: Refusal): string {
  return `// ${refusalWhere(basename, refusal)}: ${refusal.construct} — ${refusal.reason}${refusalSuffix(refusal)}`;
}

/** One refusal as a stderr diagnostic line. */
export function diagnosticLine(basename: string, refusal: Refusal): string {
  return `ffi-gen: ${refusalWhere(basename, refusal)}: ${refusal.construct}: refused — ${refusal.reason}${refusalSuffix(refusal)}`;
}

function ownershipComment(fn: MappedFunction): string {
  const parts: string[] = [];
  const borrows = fn.params.filter((p) => p.ownership === 'borrow' || p.ownership === 'pointer');
  if (borrows.length > 0) {
    parts.push(
      borrows
        .map((p) => `\`${p.tsName}\` ${p.ownership === 'borrow' ? 'borrowed' : 'borrowed opaque'}`)
        .join(', ') + ' for the call',
    );
  }
  const outs = fn.params.filter((p) => p.ownership === 'out');
  if (outs.length > 0) {
    parts.push(outs.map((p) => `\`${p.tsName}\` out-param written on success`).join(', '));
  }
  if (fn.retOwnership === 'copy-out') {
    parts.push('return copied to a fresh string at the boundary');
  } else if (fn.retOwnership === 'handle') {
    parts.push('return is a library-owned opaque handle');
  }
  if (parts.length === 0) {
    parts.push('none — value copies in, plain value out');
  }
  return `// Ownership (generated): ${parts.join('; ')}. No error convention inferred.`;
}

/** Everything the header yields: emitted functions plus every refusal (functions, globals,
 *  macros, enum constants). Pure over the model — clang never runs here, so tests build
 *  models by hand for the mapping matrix and from headers for the end-to-end proof. */
export function generate(model: HeaderModel): GenResult {
  const takenNames = new Set<string>(['CString', 'CStringOwned', 'Out']);
  const functions: MappedFunction[] = [];
  const refusals: Refusal[] = [];

  const sorted = [...model.functions].sort((a, b) =>
    a.cName < b.cName ? -1 : a.cName > b.cName ? 1 : 0,
  );
  for (const fn of sorted) {
    const mapped = classifyFunction(fn, model, takenNames);
    if (mapped.ok) {
      functions.push(mapped.fn);
    } else {
      const refusal: FunctionRefusal = mapped.refusal;
      refusals.push({
        line: refusal.line,
        construct: refusal.cName,
        kind: refusal.kind,
        reason: refusal.reason,
        code: refusal.code,
      });
    }
  }

  for (const global of [...model.globals].sort((a, b) => a.line - b.line)) {
    refusals.push({
      line: global.line,
      construct: global.name,
      kind: 'global variable',
      reason: `global variable ('${global.cType}') has no extern spelling — functions only in v0`,
      code: 'STA1130',
    });
  }

  for (const macro of model.macros) {
    refusals.push({
      line: macro.line,
      construct: macro.name,
      kind: macro.functionLike ? 'function-like macro' : 'macro constant',
      reason: macro.functionLike
        ? 'function-like macro has no declaration spelling in v0'
        : 'macro constant has no declaration spelling in v0',
      code: 'STA1130',
    });
  }

  for (const e of model.enums) {
    for (const constant of e.constants) {
      refusals.push({
        line: constant.line,
        construct: constant.name,
        kind: 'enum constant',
        reason: 'enum constant has no declaration spelling in v0 (same gap as macro constants)',
        code: 'STA1130',
      });
    }
  }

  refusals.sort((a, b) => a.line - b.line || (a.construct < b.construct ? -1 : 1));

  const brandTags = new Map<string, string>();
  for (const fn of functions) {
    for (const param of fn.params) {
      if (param.brand !== undefined && !brandTags.has(param.brand.alias)) {
        brandTags.set(param.brand.alias, param.brand.tag);
      }
    }
    if (fn.retBrand !== undefined && !brandTags.has(fn.retBrand.alias)) {
      brandTags.set(fn.retBrand.alias, fn.retBrand.tag);
    }
  }
  const brands: Brand[] = [...brandTags.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([alias, tag]) => ({ alias, tag }));
  for (const brand of brands) {
    takenNames.add(brand.alias);
  }

  const notes = new Set<string>();
  for (const fn of functions) {
    for (const param of fn.params) {
      if (param.cNote !== undefined) {
        notes.add(param.cNote);
      }
    }
    if (fn.retNote !== undefined) {
      notes.add(fn.retNote);
    }
  }

  return {
    basename: model.basename,
    functions,
    brands,
    usesCString: functions.some((fn) => fn.needsCString),
    usesOutAlias: functions.some((fn) => fn.params.some((p) => p.ownership === 'out')),
    intWidened: notes.has('int'),
    sizeWidened: notes.has('size'),
    refusals,
  };
}

/** `N emitted, M refused (kind: n, …)` — the Task 7.3 step 5 summary line, stderr-bound.
 *  Kinds sort alphabetically: the line is deterministic, not hash-ordered. */
export function summaryLine(result: GenResult): string {
  const counts = new Map<string, number>();
  for (const refusal of result.refusals) {
    counts.set(refusal.kind, (counts.get(refusal.kind) ?? 0) + 1);
  }
  const perReason = [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([kind, count]) => `${kind}: ${count}`)
    .join(', ');
  const refused =
    result.refusals.length === 0 ? '0 refused' : `${result.refusals.length} refused (${perReason})`;
  return `ffi-gen: ${result.functions.length} emitted, ${refused} from ${result.basename}`;
}

/** The whole `.d.ts`, deterministic: header legend, link pragmas, shared aliases
 *  (`CString`, then `Out<T>` when used), brands, declarations, REFUSED block.
 *  `libs` rides `--lib=<name>` in command-line order (one `// @statorLink: -l`
 *  line each); the `#include` line always names the input header's basename —
 *  mechanical, never a resolved path (docs/FFI.md §9 resolves it at use). */
export function renderDts(result: GenResult, libs: readonly string[] = []): string {
  const out: string[] = [];
  out.push(`// GENERATED by ffi-gen (plan.md §10 Task 7.3) from ${result.basename} — do not edit.`);
  out.push(`// Regenerate: node packages/compiler/src/ffi-gen/main.ts <header.h> [--out=<file>]`);
  out.push(`// ${summaryLine(result).replace('ffi-gen: ', '')}.`);
  out.push(
    `// Error conventions are NEVER inferred — audit each function and add @statorError by hand`,
  );
  out.push(
    `// (NOTES.md "comparisons are plain values"; the generator cannot tell 100/101 from failure).`,
  );
  if (result.intWidened) {
    out.push(
      `// C \`int\`-family widens to \`number\` (the i32 refinement has no declaration spelling).`,
    );
  }
  if (result.sizeWidened) {
    out.push(
      `// C \`size_t\`/\`ssize_t\` widen to \`number\` (exact only to 2^53 — the documented size_t rule).`,
    );
  }
  for (const lib of libs) {
    out.push(`// @statorLink: -l${lib}`);
  }
  // The binding-local header, anchored to the declaring file: a `"./..."` form resolves
  // against the `.d.ts` directory when the prologue is emitted (docs/FFI.md §9), so the
  // generated C finds it wherever the scratch directory sits. A bare basename would resolve
  // through the link line's `-I` flags instead, which no one passes for binding-local files.
  out.push(`// @statorLink #include "./${result.basename}"`);
  out.push('');
  if (result.usesCString) {
    out.push(`// Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md §3).`);
    out.push(`type CString = string & { readonly __statorCstr: 'CString' };`);
    out.push('');
  }
  if (result.usesOutAlias) {
    out.push(
      `// Out-param slot: the caller allocates the wrapper, the callee writes \`value\` on success.`,
    );
    out.push(`type Out<T> = { readonly value: T };`);
    out.push('');
  }
  for (const brand of result.brands) {
    out.push(
      `/** Opaque \`C ${brand.tag}\` handle (generated brand; lifetime belongs to the C library). */`,
    );
    out.push(`type ${brand.alias} = { readonly __brand: '${brand.tag}' };`);
    out.push('');
  }
  for (const fn of result.functions) {
    const params = fn.params.map((p) => `${p.tsName}: ${p.tsType}`).join(', ');
    out.push(`// C: ${fn.cSignature} — from ${result.basename}:${fn.line}`);
    out.push(ownershipComment(fn));
    out.push(`/** @statorExtern ${fn.cName} */`);
    // Long signatures wrap one-param-per-line (the repo's print width is 100): generated
    // files must satisfy the same `oxfmt --check` gate as hand-written ones, so the
    // generator formats rather than emitting lines a human must reflow.
    const single = `declare function ${fn.tsName}(${params}): ${fn.ret};`;
    if (single.length <= 100) {
      out.push(single);
    } else {
      out.push(`declare function ${fn.tsName}(`);
      for (const p of fn.params) {
        out.push(`  ${p.tsName}: ${p.tsType},`);
      }
      out.push(`): ${fn.ret};`);
    }
    out.push('');
  }
  if (result.refusals.length > 0) {
    out.push(`// ============================================================================`);
    out.push(`// REFUSED (${result.refusals.length}; v0 scope — recorded, not approximated).`);
    for (const refusal of result.refusals) {
      out.push(refusalComment(result.basename, refusal));
    }
  } else {
    out.push(`// No refusals — every declaration in ${result.basename} mapped.`);
  }
  return out.join('\n') + '\n';
}
