/* Where an `unknown` becomes something — Task 3.5's half of the frontend.
 *
 * TypeScript's narrowing is a static claim about a value, not a proof about it: after
 * `if (typeof x === 'string')`, the checker types `x` as `string` inside the block, and it is right
 * about the source it can see and wrong the moment an `as` cast, a stale `.d.ts`, or a value from
 * untyped JavaScript put something else in `x`. Golden rule 4 says a claim like that is never
 * trusted across a boundary, so this module names the boundaries: the places where the DECLARED
 * type of a value is `unknown` and the type at the point of use is concrete.
 *
 * The gate and the lowering ask the same question here, which is the point of the module existing.
 * The gate must refuse a narrowing the lowering cannot compile, and the lowering must insert a
 * check at exactly the narrowings the gate let through — the load-bearing invariant (docs/HIR.md)
 * applied to a construct that has no syntax of its own.
 */

import type * as ts from 'typescript';
import type { HType } from '../hir/types.ts';
import { H_BOOLEAN, H_NUMBER, H_STRING, hTypeEquals } from '../hir/types.ts';
import { tsTypeToHType } from './types.ts';

/** The types a runtime check can settle by looking at a value's tag, in constant time.
 *
 * Deliberately three. An object's shape, an array's element type, and a function's signature are
 * all claims a tag cannot answer — checking them means walking the value, and a "check" that walked
 * an array would turn an O(1) narrowing into an O(n) one silently. Those narrowings are refused at
 * the gate instead, so the emitter is never asked to invent a check it cannot write
 * (`CHECK_FUNCTIONS` in the emitter is this list, one layer down). */
const CHECKABLE: readonly HType[] = [H_NUMBER, H_STRING, H_BOOLEAN];

export function isCheckable(type: HType): boolean {
  return CHECKABLE.some((t) => hTypeEquals(t, type));
}

/** The type `node` is narrowed TO at this use, or `null` if this use is not a narrowing.
 *
 * `null` is the overwhelmingly common answer and covers three different situations that all mean
 * "no check here": the value was never `unknown`, it is still `unknown`, or the checker narrowed it
 * to something this model has no representation for and therefore also calls `unknown`.
 *
 * The comparison is DECLARED against here, not declared against declared. `getTypeAtLocation` on a
 * reference gives the narrowed type — that is what narrowing IS to the checker — while the type of
 * the symbol at its own declaration gives what was written. A difference between the two is a claim
 * the program is making, and this function's whole job is to spot one. */
export function narrowedTo(
  node: ts.Identifier,
  checker: ts.TypeChecker,
): { readonly declared: HType; readonly narrowed: HType } | null {
  const symbol = checker.getSymbolAtLocation(node);
  const declaration = symbol?.valueDeclaration;
  if (symbol === undefined || declaration === undefined) {
    return null;
  }
  const declared = tsTypeToHType(checker.getTypeOfSymbolAtLocation(symbol, declaration), checker);
  if (declared.kind !== 'unknown') {
    return null;
  }
  const narrowed = tsTypeToHType(checker.getTypeAtLocation(node), checker);
  return narrowed.kind === 'unknown' ? null : { declared, narrowed };
}

/** The type an `as` cast asserts, or `null` if the cast asserts nothing this compiler must check.
 *
 * Two casts need no check and are not boundaries at all. `x as T` where `x` is already `T` is the
 * identity, written for a reader rather than for the compiler. And `x as unknown` widens, which is
 * always sound — a claim that a value might be anything cannot be false.
 *
 * Everything else is the program overriding the checker, which is exactly the case golden rule 4
 * exists for, so the cast's operand type is not consulted: whether the source is `unknown` or a
 * concrete type the author is casting away from, the assertion is unproven either way and the check
 * is what settles it. */
export function assertedBy(
  cast: ts.AsExpression,
  checker: ts.TypeChecker,
): { readonly operand: HType; readonly asserted: HType } | null {
  const operand = tsTypeToHType(checker.getTypeAtLocation(cast.expression), checker);
  const asserted = tsTypeToHType(checker.getTypeAtLocation(cast), checker);
  if (asserted.kind === 'unknown' || hTypeEquals(operand, asserted)) {
    return null;
  }
  return { operand, asserted };
}

/** `file:line:col`, the location a failed check reports (STA2001).
 *
 * Built in the frontend because this is where the source text still is. TypeScript counts both from
 * 0 and every human tool counts lines and columns from 1, which is the one conversion this does. */
export function sourceLocation(node: ts.Node, sourceFile: ts.SourceFile): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${String(line + 1)}:${String(character + 1)}`;
}
