import * as ts from 'typescript';
import type { HField, HType } from '../hir/types.ts';
import {
  H_BOOLEAN,
  H_NULL,
  H_NUMBER,
  H_STRING,
  H_UNDEFINED,
  hArray,
  hFunction,
  hObject,
  hUnknown,
} from '../hir/types.ts';

/** A function type may refer to itself (`type F = () => F`), so the descent needs a stop. Four is
 * past anything a real signature nests and cheap enough to never think about again; beyond it the
 * answer is Unknown, which is always a safe answer, never a wrong one. */
const MAX_SIGNATURE_DEPTH = 4;

/** The ONLY module allowed to map ts.Type -> HType (AGENTS.md).
 * Scope: number, string, boolean, undefined, null, and single-signature function types.
 * Anything else becomes hUnknown, never a guess.
 */
export function tsTypeToHType(type: ts.Type, checker: ts.TypeChecker, depth = 0): HType {
  const f = type.flags;

  // Each primitive must match its LITERAL flag too. `1` has type `1`, not `number` -- TypeFlags
  // .Number alone maps every literal in the program to Unknown, which is a compiler that cannot
  // type `console.log(1)`. Enum is deliberately excluded from the number case even though
  // TypeFlags.NumberLike includes it: `erasableSyntaxOnly` bans enums outright, and silently
  // treating one as a number would hide that.
  if (f & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
    return H_NUMBER;
  }
  if (f & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
    return H_STRING;
  }
  if (f & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
    return H_BOOLEAN;
  }
  // `void` is a distinct type to TypeScript but the same value at runtime: a function that
  // returns nothing evaluates to undefined, and the HIR models values, not intentions.
  if (f & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
    return H_UNDEFINED;
  }
  if (f & ts.TypeFlags.Null) {
    return H_NULL;
  }

  // Both flavours of `any` land here, and this function cannot tell them apart -- a ts.Type has no
  // memory of whether an annotation was written. `isImplicitAny` answers that from the AST, so
  // the conservative flag is the safe one: the gate rejects implicit any in ts mode either way,
  // and claiming "explicit" for an inferred any would let an untyped value through silently.
  if (f & ts.TypeFlags.Any) {
    return hUnknown(true);
  }

  const fn = functionTypeToHType(type, checker, depth);
  if (fn !== null) {
    return fn;
  }

  const array = arrayTypeToHType(type, checker, depth);
  if (array !== null) {
    return array;
  }

  const object = classTypeToHType(type, checker, depth);
  if (object !== null) {
    return object;
  }

  // Everything else -- unions, tuples, objects -- is a type the HIR has no representation for
  // yet. It is Unknown, not a guess, and not an implicit any.
  return hUnknown(false);
}

/** `null` means "not a class instance this model can describe" — the caller falls through to
 * Unknown.
 *
 * Only a CLASS. An interface or a bare object type describes a shape without describing an
 * allocation, and `HObject` is a layout: it names the `JSRTClass` descriptor the emitter emitted
 * for a class declaration. A value typed by an interface may be an instance of any of several
 * classes with different layouts, so it stays Unknown until the object model can dispatch on shape.
 *
 * Declaration order is slot order, and the CHECKER's property list is what fixes it -- see the
 * comment on the loop for why `declaration.members` is not.
 *
 * The depth cap does double duty here. `class C { self: C }` is a cyclic type, and the cap is what
 * stops the descent -- deep inside, a self-reference becomes Unknown. That costs nothing real:
 * nested field types are never used to resolve a slot, because `o.a.b` asks the checker for the
 * type of `o.a` at that site, at depth zero. */
function classTypeToHType(type: ts.Type, checker: ts.TypeChecker, depth: number): HType | null {
  if (depth >= MAX_SIGNATURE_DEPTH) {
    return null;
  }
  const symbol = type.getSymbol();
  const declaration = symbol?.valueDeclaration;
  if (symbol === undefined || declaration === undefined || !ts.isClassDeclaration(declaration)) {
    return null;
  }
  // An anonymous class expression has no name to identify its layout by, and nominal equality
  // needs one. `const C = class { }` is Unknown until a class expression can be given a name.
  if (declaration.name === undefined) {
    return null;
  }

  const fields: HField[] = [];
  const methods: HField[] = [];
  // The checker's property list, not `declaration.members`, is the source of the slot order. In a
  // `.ts` class the two agree; in a `.js` one they do not, because a field is declared by
  // `this.x = …` in the constructor and has no member node at all. Asking the checker is what
  // makes js mode's classes have the same layout as ts mode's -- with `unknown` field types,
  // which is the dynamic path, not a missing one.
  for (const property of checker.getPropertiesOfType(type)) {
    const at = property.valueDeclaration ?? property.declarations?.[0];
    if (at === undefined) {
      continue;
    }
    const member: HField = {
      name: property.name,
      type: tsTypeToHType(checker.getTypeOfSymbolAtLocation(property, at), checker, depth + 1),
    };
    // Split by what the member's DECLARATION is, not by what its type is: a field holding a
    // closure (`onClick: () => void`) is a slot, and a method is not, though both are functions.
    if (property.declarations?.some(ts.isMethodDeclaration) === true) {
      methods.push(member);
    } else {
      fields.push(member);
    }
  }
  return hObject(declaration.name.text, fields, methods);
}

/** `null` means "not an array this model can describe" — the caller falls through to Unknown.
 *
 * `checker.isArrayType` is true for `T[]` and `Array<T>` and false for a TUPLE, which is the
 * distinction that matters: a tuple has a different type per position, and `HArray` holds one
 * element type for every position. Treating `[number, string]` as an array would silently type
 * `t[1]` as `number`.
 *
 * The recursion depth is shared with function types on purpose. `type T = T[]` is legal and would
 * otherwise descend forever, and an array of functions of arrays can nest through both. */
function arrayTypeToHType(type: ts.Type, checker: ts.TypeChecker, depth: number): HType | null {
  if (depth >= MAX_SIGNATURE_DEPTH || !checker.isArrayType(type)) {
    return null;
  }
  const [element] = checker.getTypeArguments(type as ts.TypeReference);
  if (element === undefined) {
    return null;
  }
  return hArray(tsTypeToHType(element, checker, depth + 1));
}

/** `null` means "not a function this model can describe" — the caller falls through to Unknown.
 *
 * OVERLOADS ARE DELIBERATELY EXCLUDED. A type with two call signatures is two functions sharing a
 * name, and `HFunction` holds one signature; picking the first would silently compile every call
 * as if the other overload did not exist. Overload resolution belongs at the call site, where the
 * checker already did it, and arrives with the pass that asks the checker per call. */
function functionTypeToHType(type: ts.Type, checker: ts.TypeChecker, depth: number): HType | null {
  if (depth >= MAX_SIGNATURE_DEPTH) {
    return null;
  }
  const signatures = type.getCallSignatures();
  const signature = signatures.length === 1 ? signatures[0] : undefined;
  if (signature === undefined) {
    return null;
  }
  const params = signature.getParameters().map((symbol) => {
    const declaration = symbol.valueDeclaration;
    if (declaration === undefined) {
      return hUnknown(false);
    }
    return tsTypeToHType(
      checker.getTypeOfSymbolAtLocation(symbol, declaration),
      checker,
      depth + 1,
    );
  });
  return hFunction(params, tsTypeToHType(signature.getReturnType(), checker, depth + 1));
}

/** Check if a type is implicitly any (no annotation, inferred as any).
 * Used by the gate to distinguish STA1001 (explicit any) from STA1003 (implicit any).
 */
export function isImplicitAny(node: ts.Node, typeChecker: ts.TypeChecker): boolean {
  // Only a node that COULD have carried an annotation can have an *implicit* any. Asking the
  // checker about anything else is both meaningless and unsafe: getTypeAtLocation walks
  // `node.parent`, which a SourceFile does not have, and throws.
  const annotation = annotationSiteOf(node);
  if (annotation === null || annotation !== undefined) {
    return false; // not an annotation site, or annotated explicitly
  }
  return (typeChecker.getTypeAtLocation(node).flags & ts.TypeFlags.Any) !== 0;
}

/** `null` = this node is not a place an annotation can go. `undefined` = it is, and there is none.
 * Otherwise the annotation itself. The three-way answer is what lets the caller tell "annotated
 * with something else" apart from "nothing to annotate". */
function annotationSiteOf(node: ts.Node): ts.TypeNode | null | undefined {
  if (
    ts.isVariableDeclaration(node) ||
    ts.isParameter(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  ) {
    return node.type;
  }
  return null;
}

/** Check if a type annotation is explicitly `any`.
 * Used by the gate to emit STA1001 for explicit `any` in ts mode.
 */
export function hasExplicitAny(node: ts.Node): boolean {
  if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
    const typeNode = (node as ts.VariableDeclaration | ts.ParameterDeclaration).type;
    if (typeNode && ts.isToken(typeNode) && typeNode.kind === ts.SyntaxKind.AnyKeyword) {
      return true;
    }
  }
  if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const typeNode = (node as ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression)
      .type;
    if (typeNode && ts.isToken(typeNode) && typeNode.kind === ts.SyntaxKind.AnyKeyword) {
      return true;
    }
  }
  // Check for `as any` casts
  if (ts.isAsExpression(node)) {
    const typeNode = node.type;
    if (ts.isToken(typeNode) && typeNode.kind === ts.SyntaxKind.AnyKeyword) {
      return true;
    }
  }
  return false;
}
