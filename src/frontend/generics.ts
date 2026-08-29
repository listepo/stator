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
import { hTypeName } from '../hir/types.ts';
import { tsTypeToHType } from './types.ts';

/** What a call to a generic function resolves to.
 *
 * `'unresolved'` is a real answer, not a failure to compute one: a type parameter that appears in
 * no parameter and in no return type — `function f<T>(): void` — is never determined by any call,
 * and there is nothing to specialize on. The gate turns that into a `not-yet` rather than letting
 * the lowering emit a specialization with a type parameter still in it. */
export type Instantiation =
  | {
      readonly kind: 'generic';
      readonly declaration: ts.FunctionDeclaration;
      readonly typeArguments: readonly HType[];
    }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'not-generic' };

/** The instantiation a call expression names, if its callee is a generic function declaration. */
export function genericCallInstantiation(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): Instantiation {
  const resolved = checker.getResolvedSignature(call);
  const declaration = resolved?.getDeclaration();
  if (
    resolved === undefined ||
    declaration === undefined ||
    !ts.isFunctionDeclaration(declaration)
  ) {
    return { kind: 'not-generic' };
  }
  const declared = checker.getSignatureFromDeclaration(declaration);
  const typeParameters = declared?.getTypeParameters();
  if (declared === undefined || typeParameters === undefined || typeParameters.length === 0) {
    return { kind: 'not-generic' };
  }

  const substitution = new Map<string, HType>();
  const declaredParams = declared.getParameters();
  const resolvedParams = resolved.getParameters();
  for (let i = 0; i < declaredParams.length; i++) {
    const declaredParam = declaredParams[i];
    const resolvedParam = resolvedParams[i];
    if (declaredParam === undefined || resolvedParam === undefined) {
      continue;
    }
    unify(
      tsTypeToHType(checker.getTypeOfSymbolAtLocation(declaredParam, declaration), checker),
      tsTypeToHType(checker.getTypeOfSymbolAtLocation(resolvedParam, call), checker),
      substitution,
    );
  }
  // The return type as well as the parameters: `function make<T>(n: number): T[]` binds `T` from
  // nothing the arguments say, and the call site's own type is where the answer is.
  unify(
    tsTypeToHType(declared.getReturnType(), checker),
    tsTypeToHType(resolved.getReturnType(), checker),
    substitution,
  );

  const typeArguments: HType[] = [];
  for (const parameter of typeParameters) {
    const bound = substitution.get(parameter.getSymbol()?.getName() ?? '');
    if (bound === undefined) {
      return { kind: 'unresolved' };
    }
    typeArguments.push(bound);
  }
  return { kind: 'generic', declaration, typeArguments };
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

/** Binds every type parameter in `declared` to the type standing in its place in `concrete`.
 *
 * First binding wins. A second, different one cannot happen for a well-typed call — the checker
 * unified these two signatures itself before either reached here — and silently preferring the
 * later one would hide the day that stops being true. */
function unify(declared: HType, concrete: HType, out: Map<string, HType>): void {
  if (declared.kind === 'type-param') {
    if (!out.has(declared.name)) {
      out.set(declared.name, concrete);
    }
    return;
  }
  if (declared.kind === 'array' && concrete.kind === 'array') {
    unify(declared.element, concrete.element, out);
    return;
  }
  if (declared.kind === 'set' && concrete.kind === 'set') {
    unify(declared.element, concrete.element, out);
    return;
  }
  if (declared.kind === 'map' && concrete.kind === 'map') {
    unify(declared.key, concrete.key, out);
    unify(declared.value, concrete.value, out);
    return;
  }
  if (declared.kind === 'fn' && concrete.kind === 'fn') {
    for (let i = 0; i < declared.params.length; i++) {
      const d = declared.params[i];
      const c = concrete.params[i];
      if (d !== undefined && c !== undefined) {
        unify(d, c, out);
      }
    }
    unify(declared.ret, concrete.ret, out);
  }
  // An object stops the walk: a class is nominal here, so its fields carry no type parameter this
  // model tracks — a generic CLASS is a separate feature, refused at the gate.
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
    default:
      return type;
  }
}
