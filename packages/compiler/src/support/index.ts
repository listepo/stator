/* Shared support: the diagnostics engine (stable STA codes, spans, mode) and utilities.
 * User-facing failures are diagnostics, never thrown stack traces (AGENTS.md). */

export type { Diagnostic } from './diagnostics.ts';
export { diagnosticFromFile, diagnosticFromNode, renderDiagnostic } from './diagnostics.ts';
export type { RuntimeFlavor } from './features.ts';
export { intlEnabled, runtimeFlavor } from './features.ts';
export { COMPLETED_PHASES } from './phases.ts';
