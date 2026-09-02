import * as ts from 'typescript';
import type { HField, HType } from '../hir/types.ts';
import {
  accessorName,
  H_BOOLEAN,
  H_DATE,
  H_NULL,
  H_NUMBER,
  H_REGEXP,
  H_STRING,
  H_UNDEFINED,
  hArray,
  hFunction,
  hMap,
  hObject,
  hPromise,
  hSet,
  hTypeEquals,
  hTypeName,
  hTypeParam,
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

  // Before every structural test below, because a type parameter has no structure to test: `T` is
  // a name standing in for a type the call site supplies, and monomorphization is what replaces it.
  // Mapping it to Unknown instead would be a silent decision to BOX every generic value, which is
  // exactly the "compile a typed subset" rule the project exists to keep (plan §0.1).
  //
  // The declaration test is not decoration. Polymorphic `this` -- the type of `this` inside a class
  // method -- carries `TypeFlags.TypeParameter` too, and its symbol is the CLASS, declared by a
  // ClassDeclaration. Reading the flag alone types every `this.x` receiver as a type parameter,
  // which turns every field read in every method into an unlowerable expression.
  const typeParameter = declaredTypeParameterName(type);
  if (f & ts.TypeFlags.TypeParameter && typeParameter !== undefined) {
    return hTypeParam(typeParameter);
  }

  const fn = functionTypeToHType(type, checker, depth);
  if (fn !== null) {
    return fn;
  }

  const array = arrayTypeToHType(type, checker, depth);
  if (array !== null) {
    return array;
  }

  const collection = collectionTypeToHType(type, checker, depth);
  if (collection !== null) {
    return collection;
  }

  if (isLibInterface(type, 'RegExp')) {
    return H_REGEXP;
  }

  if (isLibInterface(type, 'Date')) {
    return H_DATE;
  }

  const object = classTypeToHType(type, checker, depth);
  if (object !== null) {
    return object;
  }

  // A union whose constituents all map to ONE HType is that type -- `"a" | "b"` is a string, and
  // `typeof x` is a union of eight string literals, which is why this rule is what makes `typeof`
  // usable at all rather than a value the compiler has to box. This is widening, not guessing: the
  // answer is the same for every constituent, so no information is being invented.
  //
  // A union that maps to more than one HType stays Unknown. That is the real union case (`string |
  // number`), the HIR has no node for it, and narrowing one is what a boundary check is for.
  if (type.isUnion()) {
    const constituents = type.types.map((t) => tsTypeToHType(t, checker, depth));
    const [first] = constituents;
    if (first !== undefined && constituents.every((c) => hTypeEquals(first, c))) {
      return first;
    }
    return hUnknown(false);
  }

  const shape = shapeTypeToHType(type, checker, depth);
  if (shape !== null) {
    return shape;
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
  //
  // ORDER is a second question, and the checker answers it wrongly for a subclass: it lists own
  // properties first and inherited ones after (`class B extends A` gives `b1, a1`). A subclass's
  // layout has to START with its base's, in the base's own slot order, or a base-typed read of a
  // subclass instance lands on the wrong slot -- which is the fact `hTypeAssignable` rests on.
  //
  // So the list is rebuilt from the chain, ROOT FIRST, asking each class for its own properties
  // and skipping names an ancestor already claimed. Each class's list is own-first-then-inherited,
  // and by the time it is reached every inherited name is claimed, so what survives is exactly
  // that class's own properties in its own declaration order. Sorting the subclass's flat list
  // cannot do this: a `.js` field assigned in BOTH the base and the subclass has a declaration in
  // each, and it must take the BASE's slot -- one slot, at the base's index -- which falls out of
  // "first claim wins" and does not fall out of any ranking of the merged list.
  const chain = ancestry(declaration, checker); // root ancestor first, this class last
  const claimed = new Set<string>();
  for (const ancestor of chain) {
    const ancestorType = declaredTypeOf(ancestor, checker);
    if (ancestorType === undefined) {
      continue;
    }
    for (const property of checker.getPropertiesOfType(ancestorType)) {
      const at = property.valueDeclaration ?? property.declarations?.[0];
      if (at === undefined || claimed.has(property.name)) {
        continue;
      }
      claimed.add(property.name);
      const declarations = property.declarations ?? [];
      const valueType = tsTypeToHType(
        checker.getTypeOfSymbolAtLocation(property, at),
        checker,
        depth + 1,
      );
      // An accessor is not a slot and never was: `x` names a pair of functions, and the checker's
      // property type is what the GETTER returns. So it contributes one method per half, under a
      // name no source can spell, and the property name claims no field. A class with a getter
      // therefore keeps the fixed-slot layout of its actual fields -- only `x` itself is a call.
      const getter = declarations.some(ts.isGetAccessorDeclaration);
      const setter = declarations.some(ts.isSetAccessorDeclaration);
      if (getter || setter) {
        if (getter) {
          methods.push({
            name: accessorName('get', property.name),
            type: hFunction([], valueType),
          });
        }
        if (setter) {
          methods.push({
            name: accessorName('set', property.name),
            type: hFunction([valueType], H_UNDEFINED),
          });
        }
        continue;
      }
      const member: HField = { name: property.name, type: valueType };
      // Split by what the member's DECLARATION is, not by what its type is: a field holding a
      // closure (`onClick: () => void`) is a slot, and a method is not, though both are functions.
      if (declarations.some(ts.isMethodDeclaration)) {
        methods.push(member);
      } else {
        fields.push(member);
      }
    }
  }
  // Nearest ancestor first, which is the order `hTypeAssignable` and `instanceof` read it in.
  const bases = chain
    .slice(0, -1)
    .reverse()
    .map((c) => c.name?.text)
    .filter((n): n is string => n !== undefined);
  return hObject(declaration.name.text, fields, methods, bases);
}

/** `null` means "not an object literal's shape" — the caller falls through to Unknown.
 *
 * An object literal has no declaration to be a layout OF, so its layout comes from the type: the
 * properties in declaration order, which for a literal type IS the order they were written.
 *
 * The name is the shape itself (`{x: number, y: string}`), which does three things at once. It is
 * unspellable -- no class may be called that -- so it can never collide with a class name; it is
 * structural, so two literals with the same keys and types share one layout and are assignable to
 * each other, which is what a literal type MEANS; and the leading brace is the emitter's signal
 * that this descriptor prints no name, because `console.log({x: 1})` shows `{ x: 1 }`.
 *
 * Only an anonymous shape. An INTERFACE is excluded deliberately: a value typed by one may be an
 * instance of any of several classes with different layouts, and giving it a layout of its own
 * would let a class instance be read through the wrong one. Anything with a call signature, a
 * construct signature, an index signature, a method or an optional property is excluded too --
 * each needs something a fixed slot list cannot hold. */
function shapeTypeToHType(type: ts.Type, checker: ts.TypeChecker, depth: number): HType | null {
  if (depth >= MAX_SIGNATURE_DEPTH) {
    return null;
  }
  const symbol = type.getSymbol();
  const anonymous =
    symbol !== undefined &&
    (symbol.flags & (ts.SymbolFlags.ObjectLiteral | ts.SymbolFlags.TypeLiteral)) !== 0;
  if (
    !anonymous ||
    checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0 ||
    checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0 ||
    checker.getIndexInfosOfType(type).length > 0
  ) {
    return null;
  }
  const fields: HField[] = [];
  for (const property of checker.getPropertiesOfType(type)) {
    const at = property.valueDeclaration ?? property.declarations?.[0];
    if (
      at === undefined ||
      (property.flags & ts.SymbolFlags.Optional) !== 0 ||
      (property.flags & ts.SymbolFlags.Method) !== 0
    ) {
      return null;
    }
    fields.push({
      name: property.name,
      type: tsTypeToHType(checker.getTypeOfSymbolAtLocation(property, at), checker, depth + 1),
    });
  }
  // Zero fields is not a layout: `{}` has to grow (plan.md §8 step 4), so it is Unknown and
  // takes the shape table. An all-required shape with at least one field stays fixed.
  if (fields.length === 0) {
    return null;
  }
  return hObject(shapeName(fields), fields, [], []);
}

/** Whether `type` is an anonymous object shape that goes to the DYNAMIC representation -- a shape
 * table plus inline caches (docs/VALUE.md §4.10) -- rather than a fixed layout.
 *
 * The line between the two paths is drawn here and nowhere else. A shape qualifies when it is
 * anonymous (interfaces stay refused: a value typed by one may be an instance of any class, and
 * Phase 5 owns that), callable in no way, has no methods or accessors (calling through the shape
 * table is also Phase 5), and -- the actual trigger -- carries an OPTIONAL property, an index
 * signature, or no properties at all. An empty `{}` has to grow (plan.md §8 step 4); an
 * all-required anonymous shape with at least one field stays on the fixed path, because making
 * those dynamic too would silently deoptimize every literal in the program. */
export function isDynamicShape(type: ts.Type, checker: ts.TypeChecker): boolean {
  const symbol = type.getSymbol();
  const anonymous =
    symbol !== undefined &&
    (symbol.flags & (ts.SymbolFlags.ObjectLiteral | ts.SymbolFlags.TypeLiteral)) !== 0;
  if (
    !anonymous ||
    checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0 ||
    checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0
  ) {
    return false;
  }
  let optional = false;
  for (const property of checker.getPropertiesOfType(type)) {
    if (
      (property.flags &
        (ts.SymbolFlags.Method | ts.SymbolFlags.GetAccessor | ts.SymbolFlags.SetAccessor)) !==
      0
    ) {
      return false;
    }
    optional = optional || (property.flags & ts.SymbolFlags.Optional) !== 0;
  }
  return (
    optional ||
    checker.getIndexInfosOfType(type).length > 0 ||
    checker.getPropertiesOfType(type).length === 0
  );
}

/** Whether an object literal should take the shape-table path.
 *
 * The contextual type wins when it is itself a dynamic shape (`const o: { x?: number } = { x: 1 }`).
 * Otherwise the literal's own type decides: empty `{}` is dynamic even when the context is `any`
 * (an untyped parameter), which is not a shape `isDynamicShape` would recognize. */
export function objectLiteralIsDynamic(
  literal: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
): boolean {
  const own = checker.getTypeAtLocation(literal);
  const contextual = checker.getContextualType(literal);
  return (
    (contextual !== undefined && isDynamicShape(contextual, checker)) ||
    isDynamicShape(own, checker)
  );
}

/** The structural name of a shape: what makes two identical literals one layout. */
export function shapeName(fields: readonly HField[]): string {
  return `{${fields.map((f) => `${f.name}: ${hTypeName(f.type)}`).join(', ')}}`;
}
/** The instance type a class declaration declares, or `undefined` for an anonymous one. Going
 * through the name's symbol is what makes this answerable for any class in a chain, not just the
 * one whose `ts.Type` the caller happened to start from. */
function declaredTypeOf(
  declaration: ts.ClassDeclaration,
  checker: ts.TypeChecker,
): ts.Type | undefined {
  const symbol =
    declaration.name === undefined ? undefined : checker.getSymbolAtLocation(declaration.name);
  return symbol === undefined ? undefined : checker.getDeclaredTypeOfSymbol(symbol);
}

/** The inheritance chain ending at `declaration`, ROOT ANCESTOR FIRST. Member lookups want the
 * other order -- an override must be found before what it overrides -- and reverse it themselves;
 * layout construction wants this one, so a base's fields keep their slots in every subclass. A class with no base is a
 * one-element chain. Stops at anything that is not a class declaration -- extending an expression
 * or an ambient class is rejected at the gate, and stopping quietly here rather than throwing keeps
 * this function total. */
export function ancestry(
  declaration: ts.ClassDeclaration,
  checker: ts.TypeChecker,
): ts.ClassDeclaration[] {
  const chain: ts.ClassDeclaration[] = [];
  let current: ts.ClassDeclaration | undefined = declaration;
  // A cycle is impossible in well-formed source and the checker has already rejected one, but the
  // seen-set makes that a property of this loop rather than of its input.
  const seen = new Set<ts.ClassDeclaration>();
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    chain.unshift(current);
    current = baseClassOf(current, checker);
  }
  return chain;
}

/** The class a declaration extends, or `undefined`. `implements` clauses are skipped: they are
 * type-only and erase, so they contribute nothing to a layout. */
export function baseClassOf(
  declaration: ts.ClassDeclaration,
  checker: ts.TypeChecker,
): ts.ClassDeclaration | undefined {
  const clause = declaration.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
  const expression = clause?.types[0]?.expression;
  if (expression === undefined) {
    return undefined;
  }
  const base = checker.getSymbolAtLocation(expression)?.valueDeclaration;
  return base !== undefined && ts.isClassDeclaration(base) ? base : undefined;
}

/** The class declaration a type came from, or `undefined` if the type is not a class instance
 * this subset models. This must stay in step with `classTypeToHType` below: the gate's accept set
 * is the HIR's vocabulary, so a shape accepted on the strength of this that maps to Unknown there
 * would be a construct the lowering cannot lower. */
export function classDeclarationOf(type: ts.Type): ts.ClassDeclaration | undefined {
  const declaration = type.getSymbol()?.valueDeclaration;
  return declaration !== undefined &&
    ts.isClassDeclaration(declaration) &&
    declaration.name !== undefined
    ? declaration
    : undefined;
}

/** Whether a class member carries `static`. */
export function isStaticMember(member: ts.ClassElement): boolean {
  return (
    ts.canHaveModifiers(member) &&
    ts.getModifiers(member)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) === true
  );
}

/** The static member `C.name` names, walking the chain -- statics are inherited in JavaScript, so
 * `D.count` on `class D extends C` reads the ONE binding `C` declared. `wantMethod` narrows to a
 * method (`true`), a field (`false`), or either (`undefined`).
 *
 * Returns the member together with the class that declares it, because the declaring class is half
 * the binding's name: mangling by the receiver's spelling would give `D.count` and `C.count` two
 * bindings for one static. */
export function staticMemberOf(
  access: ts.PropertyAccessExpression,
  checker: ts.TypeChecker,
  wantMethod: boolean | undefined,
): { owner: ts.ClassDeclaration; member: ts.ClassElement } | undefined {
  if (!ts.isIdentifier(access.expression)) {
    return undefined;
  }
  const declaration = checker.getSymbolAtLocation(access.expression)?.valueDeclaration;
  if (declaration === undefined || !ts.isClassDeclaration(declaration)) {
    return undefined;
  }
  const name = access.name.text;
  const seen = new Set<ts.ClassDeclaration>();
  for (
    let current: ts.ClassDeclaration | undefined = declaration;
    current !== undefined && !seen.has(current);
    current = baseClassOf(current, checker)
  ) {
    seen.add(current);
    const member = current.members.find(
      (m) =>
        isStaticMember(m) &&
        m.name !== undefined &&
        (ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name)) &&
        m.name.text === name,
    );
    if (member !== undefined) {
      return wantMethod === undefined || ts.isMethodDeclaration(member) === wantMethod
        ? { owner: current, member }
        : undefined;
    }
  }
  return undefined;
}

/** Which class in `declaration`'s ancestry declares the method `name` that `declaration` responds
 * to -- the MOST DERIVED one, since the walk starts at `declaration` itself.
 *
 * That is the implementation a receiver of this exact class runs, which is what both a direct call
 * and a method-table entry need. It is not necessarily the only declaration: an override means two
 * classes in one chain declare the name, and the call site is direct only where no such second
 * declaration exists anywhere in the family (see `isOverridden` in the lowering). */
export function methodDeclaringClass(
  declaration: ts.ClassDeclaration,
  name: string,
  checker: ts.TypeChecker,
): ts.ClassDeclaration | undefined {
  for (const current of ancestry(declaration, checker).toReversed()) {
    if (
      current.members.some(
        (m) =>
          ts.isMethodDeclaration(m) &&
          (ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name)) &&
          m.name.text === name,
      )
    ) {
      return current;
    }
  }
  return undefined;
}

/** Which class in `declaration`'s ancestry declares the accessor `name`, and which halves it has.
 *
 * `undefined` means the name is not an accessor at all -- a field or a method, which take the
 * ordinary paths. */
export function accessorDeclaringClass(
  declaration: ts.ClassDeclaration,
  name: string,
  checker: ts.TypeChecker,
): { owner: ts.ClassDeclaration; get: boolean; set: boolean } | undefined {
  for (const current of ancestry(declaration, checker).toReversed()) {
    const named = current.members.filter(
      (m) =>
        (ts.isGetAccessor(m) || ts.isSetAccessor(m)) &&
        ts.isIdentifier(m.name) &&
        m.name.text === name,
    );
    if (named.length > 0) {
      return {
        owner: current,
        get: named.some(ts.isGetAccessor),
        set: named.some(ts.isSetAccessor),
      };
    }
  }
  return undefined;
}

/** The name of the `<T>` this type IS, or `undefined` for a type-parameter-flagged type that no
 * `<…>` list declares — which is how TypeScript models polymorphic `this`. */
function declaredTypeParameterName(type: ts.Type): string | undefined {
  const declarations = type.getSymbol()?.getDeclarations() ?? [];
  return declarations.length > 0 && declarations.every(ts.isTypeParameterDeclaration)
    ? type.getSymbol()?.getName()
    : undefined;
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

/** `Map<K, V>` and `Set<T>` — the two builtin collections the subset compiles (rung 7).
 *
 * The name alone is not the test, and the difference matters: `class Map { … }` in user code is a
 * perfectly ordinary class, and typing it as the builtin would hand the emitter a `jsrt_map_*` call
 * against an object that has no table. The builtin is DECLARED, never defined: every one of its
 * declarations — the lib splits `Map` across four, three interfaces and the `var Map` that carries
 * the constructor — lives in a `.d.ts`, while a user's class has a body, and a body only exists in
 * a source file. (`hasNoDefaultLib` looks like the test for this and is not: it is false for every
 * split lib file, `lib.es2015.collection.d.ts` included.) A `declare class Map` in the user's own
 * `.d.ts` cannot sneak past: it collides with the lib's interface and is a TypeScript error before
 * it reaches here.
 *
 * A missing type argument is `null` rather than a guess: `Map` written bare is `Map<any, any>` to
 * the checker, and that reaches here as Unknown through the ordinary argument mapping — it is not
 * this function's business to decide what an unresolved key type means. */
/** Is this the lib's `X`, rather than a user's class or interface of the same name?
 *
 * The name alone is not the test: `class Map { … }` in user code is an ordinary class, and typing
 * it as the builtin would hand the emitter a `jsrt_map_*` call against an object with no table. The
 * builtin is DECLARED and never defined — every one of its declarations lives in a `.d.ts` — while
 * a user's class has a body, and a body only exists in a source file. (`hasNoDefaultLib` looks like
 * the test for this and is not: it is false for every split lib file.) */
function isLibInterface(type: ts.Type, name: string): boolean {
  const symbol = type.getSymbol();
  if (symbol?.getName() !== name) {
    return false;
  }
  const declarations = symbol.getDeclarations() ?? [];
  return declarations.length > 0 && declarations.every((d) => d.getSourceFile().isDeclarationFile);
}

function collectionTypeToHType(
  type: ts.Type,
  checker: ts.TypeChecker,
  depth: number,
): HType | null {
  if (depth >= MAX_SIGNATURE_DEPTH) {
    return null;
  }
  const name = type.getSymbol()?.getName();
  if (name !== 'Map' && name !== 'Set' && name !== 'Promise') {
    return null;
  }
  if (!isLibInterface(type, name)) {
    return null;
  }
  const args = checker.getTypeArguments(type as ts.TypeReference);
  if (name === 'Promise') {
    // `Promise<void>` is the return type of every async function that returns nothing, and `void`
    // is not a kind: it is `undefined` everywhere else the model meets it.
    const [value] = args;
    return value === undefined ? null : hPromise(tsTypeToHType(value, checker, depth + 1));
  }
  if (name === 'Set') {
    const [element] = args;
    return element === undefined ? null : hSet(tsTypeToHType(element, checker, depth + 1));
  }
  const [key, value] = args;
  if (key === undefined || value === undefined) {
    return null;
  }
  return hMap(tsTypeToHType(key, checker, depth + 1), tsTypeToHType(value, checker, depth + 1));
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
  // `const x = 1 as any` has no annotation on the BINDING — the `any` is on the initializer —
  // so this would otherwise fire STA1003 (implicit) while the AsExpression child also fires
  // STA1001 (explicit). The explicit one is the truth: the author wrote `any`. Skip here so
  // the child is the only diagnostic (plan.md §8 step 2).
  if (initializerIsExplicitAny(node)) {
    return false;
  }
  return (typeChecker.getTypeAtLocation(node).flags & ts.TypeFlags.Any) !== 0;
}

function initializerIsExplicitAny(node: ts.Node): boolean {
  if (!ts.isVariableDeclaration(node) && !ts.isParameter(node) && !ts.isPropertyDeclaration(node)) {
    return false;
  }
  const initializer = node.initializer;
  if (initializer === undefined) {
    return false;
  }
  return (
    (ts.isAsExpression(initializer) || ts.isTypeAssertionExpression(initializer)) &&
    isAnyKeyword(initializer.type)
  );
}

function isAnyKeyword(typeNode: ts.TypeNode): boolean {
  return ts.isToken(typeNode) && typeNode.kind === ts.SyntaxKind.AnyKeyword;
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
    if (typeNode && isAnyKeyword(typeNode)) {
      return true;
    }
  }
  if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const typeNode = (node as ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression)
      .type;
    if (typeNode && isAnyKeyword(typeNode)) {
      return true;
    }
  }
  // `as any` and `<any>x` — the latter is the same claim in the angle-bracket spelling.
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return isAnyKeyword(node.type);
  }
  return false;
}
