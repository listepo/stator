/* Frontend: ts.Program loading, the mode policy gate, and ts.Type -> HType.
 * This is the ONLY directory where `ts.Type` may appear (AGENTS.md).
 * Filled in by plan.md §5 Task 2.2. */

export { gateProgram } from './gate.ts';
export { createProgram, printDiagnostics } from './program.ts';
export { hasExplicitAny, isImplicitAny, tsTypeToHType } from './types.ts';
