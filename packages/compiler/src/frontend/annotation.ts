/* Which type annotations are claims the compiled program keeps, shared by the frontend's js-mode
 * suppression (`frontend/program.ts`) and the lowering's edges (`lower/index.ts`). */

import type * as ts from 'typescript';

/** Whether a TypeScript source file wrote `declaration`'s type annotation. js mode suppresses the
 * checker's TS2322/TS2345, and an annotation like this is the author's claim the program keeps and
 * checks at the edge (`STA2001`) rather than widens (plan-notes 301, 306). A `.js` file's JSDoc is
 * not: there the disagreement is ordinary JavaScript and runs Node's coercion. Neither is a `.d.ts`,
 * which describes code it does not compile -- usually JavaScript that coerces the same way. */
export function hasTypeScriptAnnotation(
  declaration: ts.VariableDeclaration | ts.ParameterDeclaration | ts.SignatureDeclaration,
): boolean {
  const file = declaration.getSourceFile();
  return (
    declaration.type !== undefined && !file.isDeclarationFile && !/\.[cm]?jsx?$/.test(file.fileName)
  );
}
