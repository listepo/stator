import type * as ts from 'typescript';

type Mode = 'ts' | 'js';
type DiagnosticClass = 'error' | 'never' | 'not-yet' | 'runtime' | 'internal';

/** Span in the source: offset (0-indexed UTF-16 units) and length.
 * Matches the JSON schema in docs/DIAGNOSTICS.md. */
interface Span {
  readonly start: number;
  readonly length: number;
}

/** Diagnostic carrying a stable STA code, message, mode, and source location.
 * Matches the JSON schema in docs/DIAGNOSTICS.md exactly.
 * The `phase` field is present ONLY when class is 'not-yet', and omitted (never null) otherwise. */
export interface Diagnostic {
  readonly file: string;
  readonly span: Span;
  readonly line: number; // 1-indexed
  readonly column: number; // 1-indexed
  readonly code: string; // STA code
  readonly class: DiagnosticClass;
  readonly mode: Mode;
  readonly message: string;
  readonly phase?: number; // present only for not-yet diagnostics
}

/** Build a diagnostic from a ts.Node, deriving line/column from the source file.
 * Returns the diagnostic and the absolute path to the source file.
 */
export function diagnosticFromNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  code: string,
  diag_class: DiagnosticClass,
  mode: Mode,
  message: string,
  phase?: number,
): Diagnostic {
  const span = { start: node.getStart(sourceFile), length: node.getWidth(sourceFile) };
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

  // TypeScript returns 0-indexed for both line and character; convert to 1-indexed
  const base: Diagnostic = {
    file: sourceFile.fileName,
    span,
    line: line + 1,
    column: character + 1,
    code,
    class: diag_class,
    mode,
    message,
  };

  if (diag_class === 'not-yet' && phase !== undefined) {
    return { ...base, phase };
  }

  return base;
}

/** Build a diagnostic from a file path and position.
 * Assumes you already have line/column info; primarily for errors at parse/load time. */
export function diagnosticFromFile(
  file: string,
  line: number, // 1-indexed
  column: number, // 1-indexed
  code: string,
  diag_class: DiagnosticClass,
  mode: Mode,
  message: string,
  span?: Span, // if not provided, a zero-length span at the position
  phase?: number,
): Diagnostic {
  const base: Diagnostic = {
    file,
    span: span ?? { start: 0, length: 0 },
    line,
    column,
    code,
    class: diag_class,
    mode,
    message,
  };

  if (diag_class === 'not-yet' && phase !== undefined) {
    return { ...base, phase };
  }

  return base;
}

/** Render a diagnostic in human format: file:line:col STAxxxx [mode] message */
export function renderDiagnostic(d: Diagnostic): string {
  return `${d.file}:${d.line}:${d.column} ${d.code} [${d.mode}] ${d.message}`;
}
