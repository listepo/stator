/** Typed HIR: node definitions, the HType model, and the verifier.
 * Every node carries an HType; `Unknown` is a first-class HType.
 * Phase 2 micro-subset (plan.md §5 Task 2.3).
 */

export type {
  Assignment,
  BinaryOp,
  Block,
  BooleanLiteral,
  ConsoleLogCall,
  Declaration,
  Expression,
  ExpressionStatement,
  Identifier,
  IfStatement,
  Module,
  NumberLiteral,
  Span,
  Statement,
  StringLiteral,
  WhileStatement,
} from './nodes.ts';
export type { HType } from './types.ts';
export {
  H_BOOLEAN,
  H_NULL,
  H_NUMBER,
  H_STRING,
  H_UNDEFINED,
  hTypeEquals,
  hTypeName,
  hUnknown,
} from './types.ts';
export type { VerifyProblem } from './verify.ts';
export { verifyHir } from './verify.ts';
