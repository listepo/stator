/* HType — Stator's internal type model (plan.md §2).
 *
 * This is the vocabulary everything below the frontend gate speaks. `ts.Type` never reaches
 * here: `src/frontend/types.ts` is the only module allowed to map one to the other, and
 * anything the checker cannot resolve becomes `Unknown` — never a guess.
 *
 * The model grows one kind at a time, with the lowering ladder that constructs it. `fn` landed
 * with rung 4 (functions) and `array` with rung 5. The remaining kinds from plan.md §2 —
 * object-shape, map/set, union, generic-instance, and the i32 refinement — are still absent rather
 * than stubbed: an unconstructed variant is a switch case every pass has to carry without ever
 * being able to test it.
 */

/** Every number is an f64 in Phase 2 — spec-correct JS semantics. The i32 refinement is a
 * Phase 3 optimization (plan.md §5), not a second type. */
export interface HNumber {
  readonly kind: 'number';
}

export interface HString {
  readonly kind: 'string';
}

export interface HBoolean {
  readonly kind: 'boolean';
}

export interface HUndefined {
  readonly kind: 'undefined';
}

export interface HNull {
  readonly kind: 'null';
}

/** First-class, not an error state (plan.md §2). In `ts` mode the gate rejects an `Unknown`
 * that came from an implicit `any`; in `js` mode the same type is the dynamic path. The flag
 * records which, because only the gate may act on the distinction. */
export interface HUnknown {
  readonly kind: 'unknown';
  readonly fromImplicitAny: boolean;
}

/** A callable. `params` is the DECLARED parameter list; it does not bound how many arguments a
 * call may pass, because JavaScript never did — extra arguments are dropped and missing ones are
 * `undefined`, in both modes. The arity here is what the emitter pads to, not a contract it may
 * assume the call site honoured.
 *
 * There is no `this` and no captured-environment component. A function's captures are a fact
 * about its *body*, resolved during lowering; two functions with identical signatures are the
 * same type however differently they close over their surroundings, exactly as in TypeScript. */
export interface HFunction {
  readonly kind: 'fn';
  readonly params: readonly HType[];
  readonly ret: HType;
}

/** A dense array of one element type.
 *
 * `T[]` and `Array<T>` are the same type here, as they are in TypeScript. Tuples are not this
 * type: `[number, string]` has a different element type per position, which this model cannot
 * express, so it stays Unknown until the object model gives positions their own slots.
 *
 * Note what this type does NOT promise. Reading `a[i]` yields `T | undefined`, because the index
 * may be out of range — the element type describes what the array HOLDS, not what an arbitrary
 * read produces. */
export interface HArray {
  readonly kind: 'array';
  readonly element: HType;
}

/** One field of a class instance. The ORDER of the field list is the slot order the emitter
 * allocates, so it is part of the type, not an incidental detail of how it was built. */
export interface HField {
  readonly name: string;
  readonly type: HType;
}

/** A class instance: a fixed set of named slots at fixed offsets (`docs/SUBSET.md`, "Classes with
 * fixed shape"). `name` is the class's own name, and `fields` is in slot order.
 *
 * This type is NOMINAL — see hTypeEquals. Two classes that happen to declare the same fields are
 * still two classes, which matches how TypeScript treats a class with private members and, more to
 * the point here, matches what the emitter allocated: one `JSRTClass` descriptor per declaration,
 * and `instanceof` will be a comparison of those pointers.
 *
 * Methods are deliberately NOT fields. A method is shared by every instance and resolved at the
 * call site, so giving it a slot would put one closure per instance in the heap and turn a direct
 * call into an indirect one. `methods` records the signature so a call can be checked; it costs no
 * storage. */
export interface HObject {
  readonly kind: 'object';
  readonly name: string;
  readonly fields: readonly HField[];
  readonly methods: readonly HField[];
}

export type HType =
  | HNumber
  | HString
  | HBoolean
  | HUndefined
  | HNull
  | HUnknown
  | HFunction
  | HArray
  | HObject;

export const H_NUMBER: HNumber = { kind: 'number' };
export const H_STRING: HString = { kind: 'string' };
export const H_BOOLEAN: HBoolean = { kind: 'boolean' };
export const H_UNDEFINED: HUndefined = { kind: 'undefined' };
export const H_NULL: HNull = { kind: 'null' };

export function hFunction(params: readonly HType[], ret: HType): HFunction {
  return { kind: 'fn', params, ret };
}

export function hArray(element: HType): HArray {
  return { kind: 'array', element };
}

export function hObject(
  name: string,
  fields: readonly HField[],
  methods: readonly HField[],
): HObject {
  return { kind: 'object', name, fields, methods };
}

/** The slot a field name occupies, or `undefined` if the class has no such field. The emitter and
 * the verifier both ask this, and neither may compute it any other way: an index derived from
 * anything but this list is an index into a layout nobody allocated. */
export function fieldSlot(t: HObject, name: string): number | undefined {
  const index = t.fields.findIndex((f) => f.name === name);
  return index === -1 ? undefined : index;
}

export function methodOf(t: HObject, name: string): HField | undefined {
  return t.methods.find((m) => m.name === name);
}

/** `Unknown` carries a flag, so it cannot be a shared singleton like the others. */
export function hUnknown(fromImplicitAny: boolean): HUnknown {
  return { kind: 'unknown', fromImplicitAny };
}

/** Structural equality. Recursive now that `fn` exists; every caller already routed through here
 * rather than `===`, which is why adding a compound kind did not have to touch any of them.
 *
 * Parameter types compare INVARIANTLY. This is not the assignability relation TypeScript uses —
 * it is identity, and the verifier is its only caller. A pass that needs "can an `a` be used
 * where a `b` is expected" needs a subtyping check, and must not reach for this one. */
export function hTypeEquals(a: HType, b: HType): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'unknown' && b.kind === 'unknown') {
    return a.fromImplicitAny === b.fromImplicitAny;
  }
  if (a.kind === 'array' && b.kind === 'array') {
    return hTypeEquals(a.element, b.element);
  }
  // Nominal, not structural, and not recursive. Two classes are the same type when they are the
  // same class -- which is also the only comparison that terminates: `class C { self: C }` is a
  // cyclic type, and comparing it field by field would not stop.
  if (a.kind === 'object' && b.kind === 'object') {
    return a.name === b.name;
  }
  if (a.kind === 'fn' && b.kind === 'fn') {
    return (
      a.params.length === b.params.length &&
      a.params.every((p, i) => {
        const other = b.params[i];
        return other !== undefined && hTypeEquals(p, other);
      }) &&
      hTypeEquals(a.ret, b.ret)
    );
  }
  return true;
}

/** Does Unknown appear ANYWHERE in this type, however deep?
 *
 * The verdict walk asks this, and the shallow question (`t.kind === 'unknown'`) is the wrong one:
 * `unknown[]` is an `array`, and `() => any` is a `fn`, yet neither can be compiled to unboxed
 * machine values — every element read and every call result still lands on the dynamic path. A
 * value whose type MENTIONS Unknown carries dynamic content, and the file that holds it is
 * dynamic. */
export function hTypeHasUnknown(t: HType): boolean {
  if (t.kind === 'unknown') {
    return true;
  }
  if (t.kind === 'array') {
    return hTypeHasUnknown(t.element);
  }
  if (t.kind === 'fn') {
    return t.params.some(hTypeHasUnknown) || hTypeHasUnknown(t.ret);
  }
  // An object stops the walk, for the same reason equality does: the type can be cyclic. A field
  // whose type is Unknown makes the READ of that field dynamic, and the read is where it is seen --
  // this question is about the object value itself, which is a concrete allocation either way.
  return false;
}

/** Diagnostic text. Matches the names users see in TypeScript so a Stator message and a tsc
 * message describing the same value agree. */
export function hTypeName(t: HType): string {
  if (t.kind === 'object') {
    return t.name;
  }
  if (t.kind === 'array') {
    // Parenthesised for a function element, because `(() => number)[]` and `() => number[]` are
    // different types and the unparenthesised spelling reads as the second.
    return t.element.kind === 'fn' ? `(${hTypeName(t.element)})[]` : `${hTypeName(t.element)}[]`;
  }
  if (t.kind === 'fn') {
    return `(${t.params.map((p, i) => `a${String(i)}: ${hTypeName(p)}`).join(', ')}) => ${hTypeName(t.ret)}`;
  }
  return t.kind;
}
