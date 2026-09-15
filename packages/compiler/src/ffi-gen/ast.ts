/** Clang JSON AST access (`clang -Xclang -ast-dump=json`, plan.md §10 Task 7.3 step 3).
 *
 * The generator's front end needs NO new dependency (dependency budget: `typescript` only
 * outside `src/cli/`): clang is already a hard build requirement, and its JSON AST dump is
 * parsed here with narrow `unknown` validators — never `any`, never a libclang binding.
 *
 * Only three node facts are read: `kind`/`name`, `loc` (file + line), and `type.qualType`
 * (the sugared C spelling, which preserves the typedef names the reverse ABI mapping needs).
 * Statement bodies are never inspected — except for the presence of a `CompoundStmt` child,
 * which marks a header-local definition the generator refuses.
 */

import { spawnSync } from 'node:child_process';

export type JsonScalar = string | number | boolean | null;

export interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

export type JsonValue = JsonScalar | JsonValue[] | JsonObject;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldOf(node: JsonObject, key: string): JsonValue | undefined {
  return node[key];
}

export function strField(node: JsonObject, key: string): string | undefined {
  const value = fieldOf(node, key);
  return typeof value === 'string' ? value : undefined;
}

export function boolField(node: JsonObject, key: string): boolean | undefined {
  const value = fieldOf(node, key);
  return typeof value === 'boolean' ? value : undefined;
}

/** The `inner` child list of an AST node (absent for e.g. `(void)` functions). */
export function nodeChildren(node: JsonObject): readonly JsonObject[] {
  const inner = fieldOf(node, 'inner');
  if (!Array.isArray(inner)) {
    return [];
  }
  return inner.filter(isJsonObject);
}

/** The `loc` of a node: `file` is omitted for main-file nodes, so `undefined` means the
 *  header passed on the command line; `includedFrom` chains are ignored. */
export function nodeLoc(node: JsonObject): {
  readonly file: string | undefined;
  readonly line: number;
} {
  const loc = fieldOf(node, 'loc');
  if (!isJsonObject(loc)) {
    return { file: undefined, line: 0 };
  }
  const file = strField(loc, 'file');
  const rawLine = fieldOf(loc, 'line');
  const line =
    typeof rawLine === 'number' && Number.isInteger(rawLine) && rawLine > 0 ? rawLine : 0;
  return { file, line };
}

/** The byte offset of a node's `loc`, when clang prints one (typedefs, fields, enumerators —
 *  exactly the nodes whose `line` it omits). With the header text this recovers the exact line. */
export function nodeOffset(node: JsonObject): number | undefined {
  const loc = fieldOf(node, 'loc');
  if (!isJsonObject(loc)) {
    return undefined;
  }
  const raw = fieldOf(loc, 'offset');
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
}

/** The sugared C spelling of a declaration (`type.qualType`), e.g. `const char *(sqlite3 *)`. */
export function nodeQualType(node: JsonObject): string | undefined {
  const type = fieldOf(node, 'type');
  if (!isJsonObject(type)) {
    return undefined;
  }
  return strField(type, 'qualType');
}

/** The `ownedTagDecl.id` linking a typedef to its anonymous struct/union/enum
 *  (`typedef struct {...} Point` — plan §10 Task 7.3 step 4). */
export function typedefOwnedTagId(node: JsonObject): string | undefined {
  for (const child of nodeChildren(node)) {
    if (strField(child, 'kind') !== 'ElaboratedType') {
      continue;
    }
    const owned = fieldOf(child, 'ownedTagDecl');
    if (isJsonObject(owned)) {
      return strField(owned, 'id');
    }
  }
  return undefined;
}

export interface ClangResult {
  readonly root: JsonObject;
}

/** Run `clang -Xclang -ast-dump=json -fsyntax-only` on a header and parse the JSON.
 *  `extraArgs` are verbatim clang flags (`-I`, `-D`) the caller vetted. Throws on
 *  clang failure or unparseable output — both are tool errors, never silent. */
export function runClangAstDump(
  clang: string,
  headerPath: string,
  extraArgs: readonly string[],
): ClangResult {
  const args = ['-Xclang', '-ast-dump=json', '-fsyntax-only', ...extraArgs, headerPath];
  const run = spawnSync(clang, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (run.error !== undefined) {
    throw new Error(
      `ffi-gen: cannot start "${clang}" — install clang or set --clang= (${run.error.message})`,
    );
  }
  if (run.status !== 0) {
    const detail = run.stderr.trim().split('\n').slice(0, 5).join('\n');
    throw new Error(`ffi-gen: clang failed on ${headerPath} (exit ${run.status}):\n${detail}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(run.stdout) as unknown;
  } catch {
    throw new Error(`ffi-gen: clang produced unparseable JSON for ${headerPath}`);
  }
  if (!isJsonObject(parsed)) {
    throw new Error(`ffi-gen: clang produced a non-object AST for ${headerPath}`);
  }
  return { root: parsed };
}
