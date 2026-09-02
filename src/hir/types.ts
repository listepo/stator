/* HType — Stator's internal type model (plan.md §2).
 *
 * This is the vocabulary everything below the frontend gate speaks. `ts.Type` never reaches
 * here: `src/frontend/types.ts` is the only module allowed to map one to the other, and
 * anything the checker cannot resolve becomes `Unknown` — never a guess.
 *
 * The model grows one kind at a time, with the lowering ladder that constructs it. `fn` landed
 * with rung 4 (functions), `array` with rung 5, `object` with rung 6 (a class instance, and an
 * object literal's shape under a structural name), and `map`/`set` with rung 7. The remaining kinds
 * from plan.md §2 — union, generic-instance, and the i32 refinement — are still absent rather than
 * stubbed: an unconstructed variant is a switch case every pass has to carry without ever being
 * able to test it.
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

/** A `Map<K, V>`, and below it a hash table keyed by SameValueZero.
 *
 * The key type is carried for the same reason the element type of an array is: it types `.get`,
 * `.set` and `.has`, and it is what a later pass would need to specialize the table. It does NOT
 * change the representation today — a primitive key and an object key take the same path, because
 * a NaN-boxed key already IS the unboxed value for a primitive and IS the pointer for an object,
 * and SameValueZero on the box is value equality for one and identity for the other (plan-notes 72).
 *
 * `.get` yields `V | undefined`, never `V`: an absent key really does read as `undefined`, so the
 * type of the READ is not the type of what the map HOLDS — exactly the relation an array's index
 * read has to its element type. */
export interface HMap {
  readonly kind: 'map';
  readonly key: HType;
  readonly value: HType;
}

/** A `Set<T>`. The same table as HMap with the value half unused, which is also how the runtime
 * stores it — writing the structure twice would mean two chances to get SameValueZero wrong. */
export interface HSet {
  readonly kind: 'set';
  readonly element: HType;
}

/** A boxed specialized iterator — `arr.keys()` stored, not the inlined for-of form.
 *
 * `element` is what `next().value` / for-of over the box yields. The kind tag (array-keys vs
 * map-entries) lives on the runtime object, not here: TypeScript's `ArrayIterator<T>` does not
 * say which of the three array walks produced it, and `it.next()` does not need to know. */
export interface HIterator {
  readonly kind: 'iterator';
  readonly element: HType;
}

/** A `RegExp`: a compiled pattern.
 *
 * A leaf, like `string`: a pattern describes text rather than containing values, so there is no
 * element type to carry. It is nonetheless the one builtin value in the subset with MUTABLE state
 * the language exposes — `lastIndex` moves under a `/g` or `/y` pattern — which is why a regexp
 * literal builds a new object every time it is EVALUATED rather than being hoisted to a constant. */
export interface HRegExp {
  readonly kind: 'regexp';
}

/** A `Date`: one instant, as milliseconds since the epoch.
 *
 * A leaf like `regexp`, and for the same reason -- an instant contains no values. It is the second
 * builtin with MUTABLE state the language exposes (`setUTCMonth` and its siblings write the time
 * value in place), which is why a Date is allocated per evaluation and never folded to a constant.
 *
 * The type carries no timezone. It cannot: a time value IS an instant, and every operation slice A
 * lands reads it in UTC. The local-time getters slice B adds read the same double against a zone
 * resolved at RUN time, so they change no type here either. */
export interface HDate {
  readonly kind: 'date';
}

/** A `Promise<T>`: the value a call to an async function evaluates to, and the only thing `await`
 * accepts without first wrapping it.
 *
 * `value` is what it settles WITH, and the reason this is a kind rather than an opaque leaf: the
 * type of `await p` is `p`'s value type, and the type of an async function's body is one level
 * inside the type its declaration writes. A promise that settles with a promise cannot be spelled
 * in TypeScript -- `Promise<Promise<T>>` collapses -- and the runtime adopts rather than nests, so
 * the two agree without anything here enforcing it. */
export interface HPromise {
  readonly kind: 'promise';
  readonly value: HType;
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
  /** Ancestor class names, nearest first: `class C extends B extends A` gives `['B', 'A']`.
   *
   * A name list rather than a link to the ancestor's HObject, deliberately. The chain is the whole
   * of what subtyping needs to answer (`hTypeAssignable`), and a cyclic type -- `class C { self: C }`
   * -- would make a structural link a graph the comparison has to walk. `fields` already CONTAINS
   * the inherited fields, in the ancestors' slot order, so nothing downstream has to follow this to
   * lay an object out. */
  readonly bases: readonly string[];
}

/** The `T` of `function box<T>(item: T): T` — a type the program does not have yet.
 *
 * It is NOT Unknown, and the difference is the whole of Task 3.4. Unknown means "no static
 * description exists, box it"; a type parameter means "the description arrives at the call site".
 * Monomorphization (`src/passes/monomorphize.ts`) substitutes one concrete HType for every
 * occurrence and emits a specialization, so this kind exists only between the lowering and that
 * pass. The verifier refuses it: reaching the emitter with a type parameter still in the tree means
 * a call was never specialized, and there is no C type to emit for "whatever the caller had".
 *
 * `name` is the parameter's own spelling, which is unique per function and shadowed the way scopes
 * shadow — two functions may each have a `T`, and a specialization substitutes only its own. */
export interface HTypeParam {
  readonly kind: 'type-param';
  readonly name: string;
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
  | HMap
  | HSet
  | HIterator
  | HRegExp
  | HDate
  | HPromise
  | HObject
  | HTypeParam;

export const H_NUMBER: HNumber = { kind: 'number' };
export const H_STRING: HString = { kind: 'string' };
export const H_BOOLEAN: HBoolean = { kind: 'boolean' };
export const H_UNDEFINED: HUndefined = { kind: 'undefined' };
export const H_NULL: HNull = { kind: 'null' };
export const H_REGEXP: HRegExp = { kind: 'regexp' };
export const H_DATE: HDate = { kind: 'date' };

export function hFunction(params: readonly HType[], ret: HType): HFunction {
  return { kind: 'fn', params, ret };
}

export function hArray(element: HType): HArray {
  return { kind: 'array', element };
}

export function hMap(key: HType, value: HType): HMap {
  return { kind: 'map', key, value };
}

export function hSet(element: HType): HSet {
  return { kind: 'set', element };
}

export function hIterator(element: HType): HIterator {
  return { kind: 'iterator', element };
}

export function hPromise(value: HType): HPromise {
  return { kind: 'promise', value };
}

export function hTypeParam(name: string): HTypeParam {
  return { kind: 'type-param', name };
}

export function hObject(
  name: string,
  fields: readonly HField[],
  methods: readonly HField[],
  bases: readonly string[] = [],
): HObject {
  return { kind: 'object', name, fields, methods, bases };
}

/** A getter or setter is a METHOD, under a name no source can spell: `get x`, `set x`. The space
 * does what the dot does for a static -- no identifier may contain one, so the mangled name can
 * never collide with a real member.
 *
 * The reduction is what makes accessors nearly free. An accessor is not a slot, so it never
 * disturbs a layout; it IS a method, so it inherits dispatch, the method table, arity padding and
 * the receiver parameter unchanged. `o.x` on an accessor is a call to `get x`, and `o.x = v` is a
 * call to `set x` -- which is precisely what the property means. */
export function accessorName(kind: 'get' | 'set', property: string): string {
  return `${kind} ${property}`;
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
  if (a.kind === 'map' && b.kind === 'map') {
    return hTypeEquals(a.key, b.key) && hTypeEquals(a.value, b.value);
  }
  if (a.kind === 'set' && b.kind === 'set') {
    return hTypeEquals(a.element, b.element);
  }
  if (a.kind === 'iterator' && b.kind === 'iterator') {
    return hTypeEquals(a.element, b.element);
  }
  if (a.kind === 'promise' && b.kind === 'promise') {
    return hTypeEquals(a.value, b.value);
  }
  // Nominal, not structural, and not recursive. Two classes are the same type when they are the
  // same class -- which is also the only comparison that terminates: `class C { self: C }` is a
  // cyclic type, and comparing it field by field would not stop.
  if (a.kind === 'object' && b.kind === 'object') {
    return a.name === b.name;
  }
  // By name, for the same reason a class is: two `T`s are the same type only inside one function's
  // body, and the substitution that replaces them is per specialization.
  if (a.kind === 'type-param' && b.kind === 'type-param') {
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

/** Can a value of type `value` be used where a `target` is expected?
 *
 * This is the subtyping question `hTypeEquals` refuses to answer, and it exists because inheritance
 * made the two differ: a `Dog` IS a usable `Animal`, and identity says otherwise. Every other kind
 * is invariant here -- the subset has no variance anywhere else, and inventing some would be a
 * silent widening of what the verifier accepts.
 *
 * The class case reads the ancestor NAMES rather than comparing layouts, which is sound for exactly
 * the reason the layout is a prefix: a subclass's fields begin with its base's, in the base's slot
 * order, so a base-typed read of a subclass instance finds what it expects at the offset it
 * expects. If that prefix rule is ever broken, this function silently becomes wrong -- which is why
 * the ordering is built in one place (`classTypeToHType`) and checked by the verifier's slot rule
 * rather than trusted. */
export function hTypeAssignable(value: HType, target: HType): boolean {
  // Unknown on EITHER side is assignable, and the two directions are the same fact seen twice.
  // An Unknown target promises nothing, so nothing can violate it. An Unknown VALUE is a value the
  // HIR has no static description of -- which at runtime is a boxed `jsrt_value` like every other,
  // stored into a slot by a total operation. Refusing it would make ordinary js-mode source an
  // internal error: `let total = 0; total = add(total, 3)` with an untyped `add` has a `number`
  // binding and an Unknown value, and the checker is right about both.
  if (value.kind === 'unknown' || target.kind === 'unknown') {
    return true;
  }
  if (value.kind === 'object' && target.kind === 'object') {
    return value.name === target.name || value.bases.includes(target.name);
  }
  // Arrays (and the same fact for maps/sets) recurse: `unknown[]` is not kind `unknown`, so the
  // clause above would not fire, and `hTypeEquals` then rejects two `unknown[]` whose elements
  // differ only in `fromImplicitAny` — which is exactly `var xs = []` after the hoist splits the
  // binding from the initializer (plan-notes 146).
  if (value.kind === 'array' && target.kind === 'array') {
    return hTypeAssignable(value.element, target.element);
  }
  return hTypeEquals(value, target);
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
  if (t.kind === 'array' || t.kind === 'set' || t.kind === 'iterator') {
    return hTypeHasUnknown(t.element);
  }
  if (t.kind === 'map') {
    return hTypeHasUnknown(t.key) || hTypeHasUnknown(t.value);
  }
  if (t.kind === 'fn') {
    return t.params.some(hTypeHasUnknown) || hTypeHasUnknown(t.ret);
  }
  // An object stops the walk, for the same reason equality does: the type can be cyclic. A field
  // whose type is Unknown makes the READ of that field dynamic, and the read is where it is seen --
  // this question is about the object value itself, which is a concrete allocation either way.
  return false;
}

/** Does this type still mention a type parameter, however deep?
 *
 * Two callers, asking the same question for opposite reasons. The lowering asks before it accepts a
 * tuple — a specialization whose own type arguments are not concrete is not a specialization. The
 * verifier asks of every node, where a `true` is a bug: monomorphization removes type parameters by
 * never building one, so a survivor means a call was not specialized. */
export function hasTypeParam(t: HType): boolean {
  switch (t.kind) {
    case 'type-param':
      return true;
    case 'array':
    case 'set':
    case 'iterator':
      return hasTypeParam(t.element);
    case 'map':
      return hasTypeParam(t.key) || hasTypeParam(t.value);
    case 'fn':
      return t.params.some(hasTypeParam) || hasTypeParam(t.ret);
    default:
      // An object stops the walk for the reason equality does: the type can be cyclic. A generic
      // CLASS is a separate feature the gate refuses, so no field can hold a type parameter today.
      return false;
  }
}

/** Diagnostic text. Matches the names users see in TypeScript so a Stator message and a tsc
 * message describing the same value agree. */
export function hTypeName(t: HType): string {
  if (t.kind === 'object' || t.kind === 'type-param') {
    return t.name;
  }
  if (t.kind === 'array') {
    // Parenthesised for a function element, because `(() => number)[]` and `() => number[]` are
    // different types and the unparenthesised spelling reads as the second.
    return t.element.kind === 'fn' ? `(${hTypeName(t.element)})[]` : `${hTypeName(t.element)}[]`;
  }
  if (t.kind === 'map') {
    return `Map<${hTypeName(t.key)}, ${hTypeName(t.value)}>`;
  }
  if (t.kind === 'set') {
    return `Set<${hTypeName(t.element)}>`;
  }
  if (t.kind === 'iterator') {
    return `Iterator<${hTypeName(t.element)}>`;
  }
  if (t.kind === 'promise') {
    return `Promise<${hTypeName(t.value)}>`;
  }
  if (t.kind === 'fn') {
    return `(${t.params.map((p, i) => `a${String(i)}: ${hTypeName(p)}`).join(', ')}) => ${hTypeName(t.ret)}`;
  }
  // The one leaf whose spelling is not its kind: TypeScript calls it `RegExp`, and a message that
  // said `regexp` would not match what the user reads in their own editor.
  if (t.kind === 'regexp') {
    return 'RegExp';
  }
  return t.kind === 'date' ? 'Date' : t.kind;
}
