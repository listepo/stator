/* Generic instantiation — the half of Task 3.4 that has to ask the checker.
 *
 * Monomorphization needs one thing from TypeScript that HType cannot supply on its own: for a call
 * `box(42)`, which concrete type each of `box`'s type parameters stands for. The checker already
 * computed it — that is what type inference IS — but it exposes the answer only as the RESOLVED
 * signature, with the substitution already applied and thrown away.
 *
 * So the substitution is recovered by unifying the two signatures the checker will hand over: the
 * DECLARED one, whose types still mention `T`, against the RESOLVED one, whose types do not. That
 * is a public-API route to the private type mapper, and it is exact rather than a heuristic: the
 * two signatures have the same shape by construction, because one is the other instantiated.
 *
 * Unification runs on HType rather than on `ts.Type`, which is deliberate. A tuple is the identity
 * of a specialization, and two calls share one specialization exactly when their tuples are equal —
 * so the tuple must be expressed in the model the rest of the compiler compares with. It also
 * collapses literal types for free: the checker infers `T = 42` for `box(42)` and `T = 1` for
 * `box(1)`, and both map to `number`, so those two calls share one specialization instead of
 * emitting the same C twice.
 */

import * as ts from 'typescript';
import type { HType } from '../hir/types.ts';
import { hTypeName, hUnknown } from '../hir/types.ts';
import { tsTypeToHType } from './types.ts';

/** What a call to a generic function resolves to.
 *
 * Every parameter binds something: unification first, then the declared default in order,
 * then `Unknown` when nothing determines it (a parameter no argument and no return position
 * mentions is dynamically represented, not refused). There is no unresolvable case — the
 * tuple is always complete, which is what lets the gate and the lowering share one path. */
export type Instantiation =
  | {
      readonly kind: 'generic';
      readonly declaration: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;
      /** The specialization key: the declared name, or the variable for an arrow/expression. */
      readonly key: string;
      readonly typeArguments: readonly HType[];
      /** Every binding the tuple was recovered with: the caller's parameters plus any nested
       * class parameters reference arguments grounded (`Box<T>` contributing `T := number`).
       * Specializations scope all of them, not just the tuple — a body can surface a nested
       * parameter where no tuple element names it. */
      readonly substitution: ReadonlyMap<string, HType>;
    }
  | { readonly kind: 'not-generic' };

/** The instantiation a call expression names, if its callee is generic: a function
 * declaration under its own name, or an arrow or function expression under its variable's.
 *
 * An unassigned generic arrow has no home to specialize under and answers `not-generic` here;
 * the gate refuses it before lowering ever asks, so this is the backstop, not the rule. */
export function genericCallInstantiation(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): Instantiation {
  const resolved = checker.getResolvedSignature(call);
  const declaration = resolved?.getDeclaration();
  if (resolved === undefined || declaration === undefined) {
    return { kind: 'not-generic' };
  }
  let target: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | undefined;
  let key: string | undefined;
  if (ts.isFunctionDeclaration(declaration)) {
    target = declaration;
    key = declaration.name?.text ?? '';
  } else if (ts.isFunctionExpression(declaration) || ts.isArrowFunction(declaration)) {
    target = declaration;
    key = genericArrowKey(declaration);
  }
  if (target === undefined || key === undefined) {
    return { kind: 'not-generic' };
  }
  const declared = checker.getSignatureFromDeclaration(target);
  const typeParameters = declared?.getTypeParameters();
  if (declared === undefined || typeParameters === undefined || typeParameters.length === 0) {
    return { kind: 'not-generic' };
  }

  const substitution = new Map<string, HType>();
  // Reference arguments ground nested class parameters before unification runs, so first-wins
  // keeps them: `f<T>(x: Box<T>)` called with a `Box<number>` binds `T` to `number` here, and
  // the object walk below — which can only pair names, never read a reference — cannot then
  // overwrite it with the unbound parameter. The walker's names are the CLASSES' parameters;
  // where a caller's own parameter shares a name the call forces them to agree (the checker
  // inferred both from this call), so grounding first is what makes them agree here too.
  bindReferenceArguments(argumentTypesOf(call, checker), checker, substitution);
  unifyCallArguments(
    call.arguments,
    declared.getParameters(),
    resolved.getParameters(),
    target,
    call,
    checker,
    substitution,
  );
  // The return type as well as the parameters: `function make<T>(n: number): T[]` binds `T` from
  // nothing the arguments say, and the call site's own type is where the answer is.
  unify(
    tsTypeToHType(declared.getReturnType(), checker),
    tsTypeToHType(resolved.getReturnType(), checker),
    substitution,
    new Set<string>(),
  );

  // No argument (and no return position) determined this parameter. The checker falls back
  // to the declared default, and to nothing when there is none — so this does the same;
  // see `finishTuple` for why the default (never the constraint) and why `Unknown`.
  const typeArguments = finishTuple(
    typeParameters.map((parameter) => ({
      name: parameter.getSymbol()?.getName() ?? '',
      defaultType: typeParameterDefault(parameter, checker),
    })),
    substitution,
  );
  return { kind: 'generic', declaration: target, key, typeArguments, substitution };
}

/** Finishes a tuple: every parameter still unbound after unification takes its declared
 * default, in order (so a later default sees the earlier bindings), or `Unknown` when it has
 * none. See the call-site comment for why the default — a value type the checker instantiates
 * itself — and never the constraint, and why `Unknown` is the honest element when nothing
 * determines the parameter. Always complete: every parameter is set before it is read. */
function finishTuple(
  parameters: readonly { readonly name: string; readonly defaultType: HType | undefined }[],
  substitution: Map<string, HType>,
): HType[] {
  const typeArguments: HType[] = [];
  for (const parameter of parameters) {
    if (substitution.get(parameter.name) === undefined) {
      substitution.set(
        parameter.name,
        parameter.defaultType === undefined
          ? hUnknown(false)
          : substituteHType(parameter.defaultType, (n) => substitution.get(n)),
      );
    }
    // Set above when missing, so this read cannot miss — but `Map.get` types force the check,
    // and the honest `Unknown` keeps the tuple aligned whatever happens.
    const bound = substitution.get(parameter.name) ?? hUnknown(false);
    // Nested class parameters surface here still naming the class (`Box<T>` in the tuple for a
    // `Box<number>` argument); the walker's grounding rewrites them to what the reference said.
    typeArguments.push(substituteHType(bound, (n) => substitution.get(n)));
  }
  return typeArguments;
}

/** What a `new` expression resolves to, when its class is generic.
 *
 * Mirrors `genericCallInstantiation` through the CONSTRUCT signature: the tuple comes from the
 * constructor's parameters, explicit type arguments included (they are already applied in the
 * resolved signature, so no special case reads them). The type parameters live on the class,
 * not on the constructor, which is the only structural difference. */
export type ClassInstantiation =
  | {
      readonly kind: 'generic';
      readonly declaration: ts.ClassDeclaration;
      readonly typeArguments: readonly HType[];
      /** Every binding the tuple was recovered with — the class's parameters plus any nested
       * ones reference arguments grounded. Specializations scope all of them. */
      readonly substitution: ReadonlyMap<string, HType>;
    }
  | { readonly kind: 'not-generic' };

/** The instantiation a `new` expression names, if its class is generic. */
export function genericNewInstantiation(
  created: ts.NewExpression,
  checker: ts.TypeChecker,
): ClassInstantiation {
  if (created.expression === undefined) {
    return { kind: 'not-generic' };
  }
  const resolved = checker.getResolvedSignature(created);
  const declaration = resolved?.getDeclaration();
  // A class with no declared constructor resolves with no declaration at all: the class comes
  // from the callee's own symbol instead. There are no declared parameters to unify then — the
  // tuple comes from explicit type arguments, if written, or from the default/Unknown fallback.
  let classDeclaration: ts.ClassDeclaration | undefined;
  let constructor: ts.ConstructorDeclaration | undefined;
  if (declaration !== undefined && ts.isConstructorDeclaration(declaration)) {
    const parent = declaration.parent;
    classDeclaration = ts.isClassDeclaration(parent) ? parent : undefined;
    constructor = declaration;
  } else {
    const symbol = ts.isIdentifier(created.expression)
      ? checker.getSymbolAtLocation(created.expression)
      : undefined;
    const valueDeclaration = symbol?.valueDeclaration;
    classDeclaration =
      valueDeclaration !== undefined && ts.isClassDeclaration(valueDeclaration)
        ? valueDeclaration
        : undefined;
  }
  if (classDeclaration === undefined) {
    return { kind: 'not-generic' };
  }
  const typeParameters = classDeclaration.typeParameters ?? [];
  if (typeParameters.length === 0) {
    return { kind: 'not-generic' };
  }
  const substitution = new Map<string, HType>();
  bindReferenceArguments(argumentTypesOf(created, checker), checker, substitution);
  if (created.typeArguments !== undefined) {
    // Explicit arguments are authoritative: the checker resolved the construction with them,
    // so they bind before unification (which would recover the same values through the
    // resolved signature) and before the fallback (which must not shadow them).
    created.typeArguments.forEach((argument, index) => {
      const parameter = typeParameters[index];
      if (parameter !== undefined && !substitution.has(parameter.name.text)) {
        substitution.set(
          parameter.name.text,
          tsTypeToHType(checker.getTypeFromTypeNode(argument), checker),
        );
      }
    });
  }
  if (constructor !== undefined) {
    const declared = checker.getSignatureFromDeclaration(constructor);
    if (declared !== undefined) {
      unifyCallArguments(
        created.arguments,
        declared.getParameters(),
        resolved?.getParameters() ?? [],
        constructor,
        created,
        checker,
        substitution,
      );
    }
  }
  const typeArguments = finishTuple(
    typeParameters.map((parameter) => ({
      name: parameter.name.text,
      defaultType: defaultTypeOf(parameter, checker),
    })),
    substitution,
  );
  return { kind: 'generic', declaration: classDeclaration, typeArguments, substitution };
}

/** What a generic passed as an argument resolves to: `run(box, 1)` specializes `box` at the
 * parameter's function type.
 *
 * The tuple unifies the generic's declared signature against the PARAMETER (not a call): the
 * parameter is the only static description of how the value will be used. Direct identifiers in
 * positional arguments only — a spread element has no single parameter to read, and a rest
 * parameter's element type is not the value's type — and the parameter must itself be
 * function-typed (anything else is a checker error first). Raw like every other instantiation:
 * the caller substitutes the enclosing scope. */
export function genericArgumentTuple(
  argument: ts.Expression,
  outerCall: ts.CallExpression,
  checker: ts.TypeChecker,
):
  | {
      readonly declaration: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;
      readonly key: string;
      readonly typeArguments: readonly HType[];
      readonly substitution: ReadonlyMap<string, HType>;
    }
  | undefined {
  if (!ts.isIdentifier(argument)) {
    return undefined;
  }
  const generic = genericAliasTarget(argument, checker);
  if (generic === undefined) {
    return undefined;
  }
  const outer = checker.getResolvedSignature(outerCall);
  if (outer === undefined) {
    return undefined;
  }
  const index = outerCall.arguments.indexOf(argument);
  const parameter = outer.getParameters()[index];
  const parameterDeclaration = parameter === undefined ? undefined : parameter.valueDeclaration;
  if (
    parameter === undefined ||
    parameterDeclaration === undefined ||
    !ts.isParameter(parameterDeclaration) ||
    parameterDeclaration.dotDotDotToken !== undefined
  ) {
    return undefined;
  }
  const signature = checker.getSignatureFromDeclaration(generic);
  const typeParameters = signature?.getTypeParameters() ?? [];
  if (typeParameters.length === 0) {
    return undefined;
  }
  const declaredFn = tsTypeToHType(checker.getTypeAtLocation(generic), checker);
  const parameterFn = tsTypeToHType(
    checker.getTypeOfSymbolAtLocation(parameter, argument),
    checker,
  );
  if (declaredFn.kind !== 'fn' || parameterFn.kind !== 'fn') {
    return undefined;
  }
  const key = ts.isFunctionDeclaration(generic)
    ? (generic.name?.text ?? '')
    : genericArrowKey(generic);
  if (key === undefined) {
    return undefined;
  }
  const substitution = new Map<string, HType>();
  bindReferenceArguments(
    [checker.getTypeAtLocation(argument), checker.getTypeOfSymbolAtLocation(parameter, argument)],
    checker,
    substitution,
  );
  unify(declaredFn, parameterFn, substitution, new Set<string>());
  const typeArguments = finishTuple(
    typeParameters.map((typeParameter) => ({
      name: typeParameter.getSymbol()?.getName() ?? '',
      defaultType: typeParameterDefault(typeParameter, checker),
    })),
    substitution,
  );
  if (typeArguments === undefined) {
    return undefined;
  }
  return { declaration: generic, key, typeArguments, substitution };
}

/** The tuple a class reference already carries: `Box<number>` names `[number]` without asking
 * any call site.
 *
 * Used where no signature is being unified — a method call or field read on an instance whose
 * type the checker resolved to a reference. The arguments map through the HType model like any
 * annotation; anything still mentioning a type parameter (a reference inside an enclosing
 * specialization, `Box<T>`) is left for the caller to substitute. `undefined` when the type is
 * not a reference to this class, or its arity disagrees — both are the caller'sordinary paths,
 * not errors. */
export function classReferenceTuple(
  declaration: ts.ClassDeclaration,
  type: ts.Type,
  checker: ts.TypeChecker,
): HType[] | undefined {
  // The reference's own symbol is the class: an instantiation of anything else — or a bare
  // `this`-type with no arguments — is the caller's ordinary path, not an error.
  if (type.getSymbol()?.valueDeclaration !== declaration) {
    return undefined;
  }
  const parameters = declaration.typeParameters ?? [];
  const args = (type as ts.TypeReference).typeArguments;
  if (parameters.length === 0 || args === undefined || args.length !== parameters.length) {
    return undefined;
  }
  return args.map((arg) => tsTypeToHType(arg, checker));
}

/** The variable a generic arrow or function expression is aliased to, if it is one.
 *
 * Monomorphization needs a declaration to lower a second time, and for an expression that is
 * the variable holding it: `const id = <T>(x: T): T => x` specializes `id` per tuple, exactly
 * as a declaration specializes its own name. Anything else — an inline arrow, a callback, a
 * `let` that reassignment could change under a collected tuple, a nesting whose scope the
 * module-level specializations would leak — has no home to specialize under and stays refused
 * at the gate. Returns the variable's name, which keys the specializations. */
export function genericArrowKey(node: ts.Expression): string | undefined {
  let fn: ts.Expression = node;
  while (ts.isParenthesizedExpression(fn)) {
    fn = fn.expression;
  }
  if (
    (!ts.isFunctionExpression(fn) && !ts.isArrowFunction(fn)) ||
    fn.typeParameters === undefined ||
    fn.typeParameters.length === 0
  ) {
    return undefined;
  }
  let parent = fn.parent;
  while (parent !== undefined && ts.isParenthesizedExpression(parent)) {
    parent = parent.parent;
  }
  if (parent === undefined || !ts.isVariableDeclaration(parent) || !ts.isIdentifier(parent.name)) {
    return undefined;
  }
  const list = parent.parent;
  if (
    list === undefined ||
    !ts.isVariableDeclarationList(list) ||
    (list.flags & ts.NodeFlags.Const) === 0 ||
    list.declarations.length !== 1
  ) {
    return undefined;
  }
  const statement = list.parent;
  if (
    statement === undefined ||
    !ts.isVariableStatement(statement) ||
    !ts.isSourceFile(statement.parent)
  ) {
    return undefined;
  }
  return parent.name.text;
}

/** The generic a value position names, following `const` aliases and imports.
 *
 * `box` itself (a generic declaration), `id` for `const id = <T…>…` (an assigned generic
 * arrow, validated), `f` for `const f = box` and `g` for `const g = f` (aliases, transitively).
 * Only `const` links are followed — a `let`/`var` could be reassigned under a collected tuple —
 * and cycles terminate the walk (a self-referential initializer is dead code anyway). Import
 * aliases resolve through to the declaration, so an imported generic behaves like a local one.
 * `undefined` for anything else: a non-generic value, an unassigned arrow, a broken chain. */
export function genericAliasTarget(
  node: ts.Identifier,
  checker: ts.TypeChecker,
): ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | undefined {
  const seen = new Set<ts.Symbol>();
  let current: ts.Node | undefined = node;
  while (current !== undefined && ts.isIdentifier(current)) {
    let symbol = checker.getSymbolAtLocation(current);
    if (symbol === undefined) {
      return undefined;
    }
    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    if (seen.has(symbol)) {
      return undefined;
    }
    seen.add(symbol);
    const declaration = symbol.valueDeclaration;
    if (declaration === undefined) {
      return undefined;
    }
    if (
      (ts.isFunctionDeclaration(declaration) ||
        ts.isFunctionExpression(declaration) ||
        ts.isArrowFunction(declaration)) &&
      declaration.typeParameters !== undefined &&
      declaration.typeParameters.length > 0
    ) {
      // An arrow or function expression is only a generic value where it is assigned (the same
      // rule that lets it specialize); anywhere else it is the unassigned shape the gate
      // refuses, not an alias source.
      if (!ts.isFunctionDeclaration(declaration) && genericArrowKey(declaration) === undefined) {
        return undefined;
      }
      return declaration;
    }
    if (
      !ts.isVariableDeclaration(declaration) ||
      !ts.isIdentifier(declaration.name) ||
      declaration.initializer === undefined
    ) {
      return undefined;
    }
    // Through an assigned generic arrow: `const j = id` aliases what `id` holds, so the chain
    // continues at the arrow rather than stopping at the variable.
    let init: ts.Expression = declaration.initializer;
    while (ts.isParenthesizedExpression(init)) {
      init = init.expression;
    }
    if (
      (ts.isFunctionExpression(init) || ts.isArrowFunction(init)) &&
      init.typeParameters !== undefined &&
      init.typeParameters.length > 0
    ) {
      return genericArrowKey(declaration.initializer) === undefined ? undefined : init;
    }
    if (!ts.isIdentifier(init)) {
      return undefined;
    }
    const list = declaration.parent;
    if (
      list === undefined ||
      !ts.isVariableDeclarationList(list) ||
      (list.flags & ts.NodeFlags.Const) === 0 ||
      list.declarations.length !== 1
    ) {
      return undefined;
    }
    current = declaration.initializer;
  }
  return undefined;
}

/** The name a specialization is bound under: `box<number>`.
 *
 * Unspellable, like the receiver parameter's leading space and a static's dot — no identifier may
 * contain an angle bracket, so a specialization can never collide with a user binding, and the two
 * calls `box(1)` and `box(2)` produce the same name and therefore the same one function. The name
 * is a compile-time key only: the emitter names C functions `_jsrt_fn_N` by id, and the printable
 * name the closure carries stays the source's own `box`. */
export function specializationName(name: string, typeArguments: readonly HType[]): string {
  return `${name}<${typeArguments.map(hTypeName).join(', ')}>`;
}

/** The HType of a declared default (`<T = string>`), if the parameter has one.
 *
 * Read through the checker's `getTypeFromTypeNode` so the default resolves in scope — a default
 * is an ordinary type annotation, and this is the same mapping every other annotation takes. */
function defaultTypeOf(
  declaration: ts.TypeParameterDeclaration | undefined,
  checker: ts.TypeChecker,
): HType | undefined {
  if (declaration?.default === undefined) {
    return undefined;
  }
  return tsTypeToHType(checker.getTypeFromTypeNode(declaration.default), checker);
}

/** The HType of a type parameter's declared default, via its declaration. */
function typeParameterDefault(
  parameter: ts.TypeParameter,
  checker: ts.TypeChecker,
): HType | undefined {
  const declaration = parameter.getSymbol()?.getDeclarations()?.[0];
  if (declaration === undefined || !ts.isTypeParameterDeclaration(declaration)) {
    return undefined;
  }
  return defaultTypeOf(declaration, checker);
}

/** Whether a value parameter may be omitted or fall back to its initializer (`x?: T`,
 * `x: T = ...`). Its apparent type carries `| undefined` for the missing case, which is
 * missingness, not information about any type argument. */
function isOmissibleParameter(symbol: ts.Symbol): boolean {
  const declaration = symbol.valueDeclaration;
  return (
    declaration !== undefined &&
    ts.isParameter(declaration) &&
    (declaration.questionToken !== undefined || declaration.initializer !== undefined)
  );
}

/** The HType to unify a declared parameter from: the annotation itself for an omissible
 * parameter (so `x?: T` unifies `T` rather than the collapsed `unknown` its `T | undefined`
 * apparent type maps to), the apparent type otherwise. */
function declaredParamType(param: ts.Symbol, location: ts.Node, checker: ts.TypeChecker): HType {
  const declaration = param.valueDeclaration;
  if (
    declaration !== undefined &&
    ts.isParameter(declaration) &&
    (declaration.questionToken !== undefined || declaration.initializer !== undefined) &&
    declaration.type !== undefined
  ) {
    const annotated = checker.getTypeFromTypeNode(declaration.type);
    if (annotated.isUnion()) {
      const concrete = annotated.types.filter((t) => (t.flags & ts.TypeFlags.Undefined) === 0);
      const [only] = concrete;
      if (concrete.length === 1 && only !== undefined) {
        return tsTypeToHType(only, checker);
      }
    } else {
      return tsTypeToHType(annotated, checker);
    }
  }
  return tsTypeToHType(checker.getTypeOfSymbolAtLocation(param, location), checker);
}

/** The ts.Types a tuple can be grounded from: every argument's type, plus the resolved
 * return type (a `make<T>(): Box<T>` binds through its answer, not its parameters). */
function argumentTypesOf(
  call: ts.CallExpression | ts.NewExpression,
  checker: ts.TypeChecker,
): ts.Type[] {
  const args = [...(call.arguments ?? [])].map((arg) => checker.getTypeAtLocation(arg));
  const resolved = checker.getResolvedSignature(call);
  if (resolved !== undefined) {
    args.push(resolved.getReturnType());
  }
  return args;
}

/** Grounds nested class parameters from reference type arguments: `Box<number>` anywhere in an
 * argument or answer binds `T := number` for `Box<T>`.
 *
 * The HType model erases the arguments — a reference maps through its declaration, whose
 * parameters are unbound — so unification alone can only pair names, never read a reference.
 * Without this walk, `f<T>(x: Box<T>)` called with a `Box<number>` binds `T` to the unbound
 * parameter and the specialization fails verification downstream. The walk runs first so
 * first-wins keeps grounded values over paired names; structural recursion (arrays, unions,
 * signatures) finds references nested inside other types. Cyclic types stop at the revisit —
 * the first visit bound everything the cycle can say.
 *
 * Only fills UNBOUND names: a caller's own parameter keeps whatever unification binds, and a
 * second, different reference to the same name cannot overwrite the first. */
function bindReferenceArguments(
  types: readonly ts.Type[],
  checker: ts.TypeChecker,
  out: Map<string, HType>,
): void {
  const seen = new Set<ts.Type>();
  const visit = (type: ts.Type): void => {
    if (seen.has(type)) {
      return;
    }
    seen.add(type);
    const declaration = type.getSymbol()?.valueDeclaration;
    const args = (type as ts.TypeReference).typeArguments;
    if (declaration !== undefined && ts.isClassDeclaration(declaration) && args !== undefined) {
      const parameters = declaration.typeParameters ?? [];
      parameters.forEach((parameter, index) => {
        const arg = args[index];
        if (arg !== undefined && !out.has(parameter.name.text)) {
          out.set(parameter.name.text, tsTypeToHType(arg, checker));
          visit(arg);
        }
      });
    }
    if (type.isUnion()) {
      for (const constituent of type.types) {
        visit(constituent);
      }
      return;
    }
    // Arrays, tuples, maps and sets nest references in their own arguments (`Box<number>[]`
    // grounds through its element). Function types need no walk: a reference in a declared
    // parameter or return position carries no arguments to bind.
    const nested = (type as ts.TypeReference).typeArguments;
    if (nested !== undefined) {
      for (const arg of nested) {
        visit(arg);
      }
    }
  };
  for (const type of types) {
    visit(type);
  }
}

/** Unifies one call's (or construction's) arguments against the declared parameters.
 *
 * Shared by calls and `new`: both pair positional arguments with parameters, both skip a missing
 * optional (its absence is the default-or-nothing fallback's business, not unification's), and
 * both read a present argument's own type rather than the parameter's — whose apparent
 * `T | undefined` would collapse and hide the argument. */
function unifyCallArguments(
  args: readonly ts.Expression[] | undefined,
  declaredParams: readonly ts.Symbol[],
  resolvedParams: readonly ts.Symbol[],
  declaration: ts.Node,
  call: ts.Node,
  checker: ts.TypeChecker,
  substitution: Map<string, HType>,
): void {
  const seen = new Set<string>();
  for (let i = 0; i < declaredParams.length; i++) {
    const declaredParam = declaredParams[i];
    const resolvedParam = resolvedParams[i];
    if (declaredParam === undefined || resolvedParam === undefined) {
      continue;
    }
    const omissible = isOmissibleParameter(declaredParam);
    const passed = omissible ? args?.[i] : undefined;
    const argument = passed === undefined || ts.isSpreadElement(passed) ? undefined : passed;
    if (omissible && argument === undefined) {
      continue;
    }
    unify(
      declaredParamType(declaredParam, declaration, checker),
      argument === undefined
        ? tsTypeToHType(checker.getTypeOfSymbolAtLocation(resolvedParam, call), checker)
        : tsTypeToHType(checker.getTypeAtLocation(argument), checker),
      substitution,
      seen,
    );
  }
}

/** Binds every type parameter in `declared` to the type standing in its place in `concrete`.
 *
 * First binding wins. A second, different one cannot happen for a well-typed call — the checker
 * unified these two signatures itself before either reached here — and silently preferring the
 * later one would hide the day that stops being true.
 *
 * Objects unify pairwise by field and method when they lay out the same class: `f<T>(x: Box<T>)`
 * called with a `Box<number>` binds `T` to `number`, which is what makes functions over generic
 * instances specialize statically rather than fall back to the dynamic representation. Different
 * layouts do not unify — the binding, if any, comes from elsewhere. The `seen` set stops the
 * walk on cyclic layouts (`class C { self: C }` would otherwise recurse forever): revisiting a
 * pair binds nothing new, because the first visit already bound everything the pair can say. */
function unify(declared: HType, concrete: HType, out: Map<string, HType>, seen: Set<string>): void {
  if (declared.kind === 'type-param') {
    if (!out.has(declared.name)) {
      out.set(declared.name, concrete);
    }
    return;
  }
  if (declared.kind === 'array' && concrete.kind === 'array') {
    unify(declared.element, concrete.element, out, seen);
    return;
  }
  if (declared.kind === 'set' && concrete.kind === 'set') {
    unify(declared.element, concrete.element, out, seen);
    return;
  }
  if (declared.kind === 'map' && concrete.kind === 'map') {
    unify(declared.key, concrete.key, out, seen);
    unify(declared.value, concrete.value, out, seen);
    return;
  }
  if (declared.kind === 'fn' && concrete.kind === 'fn') {
    for (let i = 0; i < declared.params.length; i++) {
      const d = declared.params[i];
      const c = concrete.params[i];
      if (d !== undefined && c !== undefined) {
        unify(d, c, out, seen);
      }
    }
    unify(declared.ret, concrete.ret, out, seen);
    return;
  }
  if (declared.kind === 'object' && concrete.kind === 'object') {
    if (declared.name !== concrete.name || declared.namespace !== concrete.namespace) {
      return;
    }
    const pair = `${declared.name}◊${fieldNames(declared)}◊${fieldNames(concrete)}`;
    if (seen.has(pair)) {
      return;
    }
    seen.add(pair);
    for (const field of declared.fields) {
      const match = concrete.fields.find((f) => f.name === field.name);
      if (match !== undefined) {
        unify(field.type, match.type, out, seen);
      }
    }
    for (const method of declared.methods) {
      const match = concrete.methods.find((m) => m.name === method.name);
      if (match !== undefined) {
        unify(method.type, match.type, out, seen);
      }
    }
  }
  // Anything else — a scalar against anything, or two layouts that never agreed — binds nothing.
  // The fallback (default, then `Unknown`) decides those parameters, not this walk.
}

/** The field names of a layout, in order: what identifies one side of an object-unification pair
 * for the cycle guard. Names, not types — two visits to the same pair of layouts bind the same
 * names to the same types, so the second visit has nothing to add. */
function fieldNames(type: {
  readonly fields: readonly { readonly name: string }[];
  readonly methods: readonly { readonly name: string }[];
}): string {
  return [...type.fields, ...type.methods].map((f) => f.name).join(',');
}

/** Replaces every type parameter with what `lookup` binds it to.
 *
 * Applied where a `ts.Type` becomes an HType inside a specialization, which is what keeps a type
 * parameter out of the HIR entirely: the emitter never sees one, because none is ever built. An
 * unbound name is left ALONE rather than defaulted to Unknown — the verifier refuses a type
 * parameter, and a silent Unknown would turn a missed substitution into a boxed value nobody
 * asked for.
 *
 * A lookup FUNCTION rather than a map, because the caller in the lowering keeps its substitution in
 * the binding map it already threads everywhere, under keys no identifier can spell. */
export function substituteHType(type: HType, lookup: (name: string) => HType | undefined): HType {
  switch (type.kind) {
    case 'type-param':
      return lookup(type.name) ?? type;
    case 'array':
      return { kind: 'array', element: substituteHType(type.element, lookup) };
    case 'set':
      return { kind: 'set', element: substituteHType(type.element, lookup) };
    case 'iterator':
      return { kind: 'iterator', element: substituteHType(type.element, lookup) };
    case 'map':
      return {
        kind: 'map',
        key: substituteHType(type.key, lookup),
        value: substituteHType(type.value, lookup),
      };
    case 'fn':
      return {
        kind: 'fn',
        params: type.params.map((p) => substituteHType(p, lookup)),
        ret: substituteHType(type.ret, lookup),
      };
    // An object substitutes its members and keeps its identity: the layout (name, bases, slot
    // order) is what every slot lookup and assignability check already resolved against, so only
    // the member types change. Terminates because every HType the mapper builds is finite — the
    // mapper cuts cyclic layouts at its depth cap rather than building an infinite tree.
    case 'object':
      return {
        ...type,
        fields: type.fields.map((f) => ({ ...f, type: substituteHType(f.type, lookup) })),
        methods: type.methods.map((m) => ({ ...m, type: substituteHType(m.type, lookup) })),
      };
    default:
      return type;
  }
}
