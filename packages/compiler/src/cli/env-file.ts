/* The project `.env` (plan.md §9 Task 6.21, QA audit F4; plan-notes 330). `stator build` runs
 * in a directory whose files the user may not have written — a cloned repository — so its
 * `.env` is untrusted input. It may choose among Stator's own build options, never the programs
 * Stator runs or where its telemetry goes: `CC`, `STATOR_RUNTIME_ROOT` and every `OTEL_*`
 * exporter variable come from the real environment only. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { errnoCode } from './outputs.ts';

/** Everything a `.env` may set. A real environment variable always wins over the file. */
export const ENV_FILE_KEYS = ['STATOR_OPT', 'STATOR_RUNTIME', 'STATOR_OTEL'] as const;

const ALLOWED: ReadonlySet<string> = new Set(ENV_FILE_KEYS);

/** Keys a `.env` might plausibly carry for Stator that it is not allowed to set. Named in the
 * notice when present, so a build that ignores one says so instead of silently differing. */
function refused(key: string): boolean {
  return key === 'CC' || key.startsWith('STATOR_') || key.startsWith('OTEL_');
}

export interface EnvFileResult {
  /** The allowlisted keys the file set (absent from the real environment). */
  readonly applied: readonly string[];
  /** Stator-related keys in the file that were not applied because they are not allowed. */
  readonly ignored: readonly string[];
  /** A `.env` that exists but cannot be read; the build goes on without it. */
  readonly warning?: string;
}

/** Read `<dir>/.env` and copy only the allowlisted keys into `env`. */
export function applyEnvFile(dir: string, env: Record<string, string | undefined>): EnvFileResult {
  const path = join(dir, '.env');
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      return { applied: [], ignored: [] };
    }
    const reason = error instanceof Error ? error.message : String(error);
    return { applied: [], ignored: [], warning: `cannot read ${path} (${reason}); ignored` };
  }
  const applied: string[] = [];
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(parse(text))) {
    if (!ALLOWED.has(key)) {
      if (refused(key)) {
        ignored.push(key);
      }
      continue;
    }
    if (env[key] === undefined) {
      env[key] = value;
      applied.push(key);
    }
  }
  return { applied, ignored };
}

/** The one stderr line about the file, or undefined when there is nothing to say. */
export function envFileNotice(result: EnvFileResult): string | undefined {
  if (result.warning !== undefined) {
    return `stator: .env: ${result.warning}`;
  }
  const parts: string[] = [];
  if (result.applied.length > 0) {
    parts.push(`applied ${result.applied.join(', ')}`);
  }
  if (result.ignored.length > 0) {
    parts.push(
      `ignored ${result.ignored.join(', ')} (only ${ENV_FILE_KEYS.join(', ')} may come from .env)`,
    );
  }
  return parts.length === 0 ? undefined : `stator: .env: ${parts.join('; ')}`;
}
