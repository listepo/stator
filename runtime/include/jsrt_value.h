/* jsrt_value.h — the codegen<->runtime value contract.
 *
 * This header MIRRORS docs/VALUE.md. Where they disagree, the document is right and this file
 * is a bug. Read the document before changing anything here: every macro below is load-bearing
 * for generated C, and several encode a correctness trap (NaN canonicalization, -0.0 survival,
 * frame/pop balance) that is invisible from the code alone.
 */
#ifndef JSRT_VALUE_H
#define JSRT_VALUE_H

#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

/* ---------------------------------------------------------------- layout */

typedef uint64_t jsrt_value;

/* Top 13 bits: sign + exponent + quiet. The sign bit is deliberately part of the mask, so only
 * NEGATIVE quiet NaNs are tags and the whole positive-NaN space stays available to doubles. */
#define JSRT_NANBOX_MASK UINT64_C(0xFFF8000000000000)
#define JSRT_PAYLOAD_MASK UINT64_C(0x0000FFFFFFFFFFFF)
#define JSRT_TAG_SHIFT 48

#define JSRT_TAG_UNDEFINED 0
#define JSRT_TAG_NULL 1
#define JSRT_TAG_BOOL 2
#define JSRT_TAG_INT32 3
#define JSRT_TAG_OBJECT 4
#define JSRT_TAG_STRING 5
#define JSRT_TAG_ARRAY 6
#define JSRT_TAG_CLOSURE 7

#define JSRT_BOX(tag, payload)                       \
  (JSRT_NANBOX_MASK | ((uint64_t)(tag) << JSRT_TAG_SHIFT) | \
   ((uint64_t)(payload) & JSRT_PAYLOAD_MASK))

#define JSRT_UNDEFINED JSRT_BOX(JSRT_TAG_UNDEFINED, 0)
#define JSRT_NULL JSRT_BOX(JSRT_TAG_NULL, 0)
#define JSRT_TRUE JSRT_BOX(JSRT_TAG_BOOL, 1)
#define JSRT_FALSE JSRT_BOX(JSRT_TAG_BOOL, 0)

/* The one NaN any double is allowed to have once boxed. See jsrt_number(). */
#define JSRT_CANONICAL_NAN UINT64_C(0x7FF8000000000000)

static inline bool jsrt_is_double(jsrt_value v) {
  return (v & JSRT_NANBOX_MASK) != JSRT_NANBOX_MASK;
}

static inline uint8_t jsrt_tag(jsrt_value v) {
  return (uint8_t)((v >> JSRT_TAG_SHIFT) & 0x7u);
}

static inline bool jsrt_is(jsrt_value v, uint8_t tag) {
  return !jsrt_is_double(v) && jsrt_tag(v) == tag;
}

/* ------------------------------------------------------------ conversions */

/* The ONLY sanctioned way to get a double into a jsrt_value. Generated C never bit-casts.
 *
 * x86-64's default NaN from 0.0/0.0 is 0xFFF8000000000000 -- bit-identical to JSRT_UNDEFINED.
 * An un-canonicalized arithmetic NaN would therefore silently BECOME undefined. ECMAScript
 * exposes only one NaN, so collapsing them all to the positive quiet NaN is unobservable. */
static inline jsrt_value jsrt_number(double d) {
  jsrt_value v;
  memcpy(&v, &d, sizeof v); /* memcpy is the only strict-aliasing-safe pun; compiles to a move */
  return jsrt_is_double(v) ? v : JSRT_CANONICAL_NAN;
}

static inline double jsrt_to_double(jsrt_value v) {
  double d;
  memcpy(&d, &v, sizeof d);
  return d;
}

static inline jsrt_value jsrt_bool(bool b) { return b ? JSRT_TRUE : JSRT_FALSE; }

static inline bool jsrt_as_bool(jsrt_value v) { return (v & 1u) != 0u; }

static inline int32_t jsrt_as_int32(jsrt_value v) {
  return (int32_t)(uint32_t)(v & UINT64_C(0xFFFFFFFF));
}

static inline void *jsrt_ptr(jsrt_value v) {
  return (void *)(uintptr_t)(v & JSRT_PAYLOAD_MASK);
}

/* Phase 2 never calls this -- the walking skeleton keeps every number an f64 (plan.md §5), and
 * the i32 fast path arrives with NUMERIC.md in Phase 3. It is defined now because the -0.0 rule
 * below is the reason the Int32 tag cannot be introduced casually later.
 *
 * (double)(int32_t)(-0.0) == -0.0 is TRUE, so the obvious integral test admits -0.0 and would
 * quietly turn it into +0 -- breaking Object.is(-0, 0) === false and 1/-0 === -Infinity. */
static inline bool jsrt_fits_int32(double d) {
  return d >= -2147483648.0 && d <= 2147483647.0 && (double)(int32_t)d == d &&
         !(d == 0.0 && signbit(d));
}

/* --------------------------------------------------------------- strings */

typedef struct JSString {
  uint32_t length;  /* UTF-16 code units -- not bytes, not code points */
  uint16_t data[];  /* flexible array member; NOT NUL-terminated */
} JSString;

/* Generated C touches string contents only through these two, never ->data[i] directly, so that
 * rope/small-string representations stay a runtime-only change (docs/VALUE.md §2). */
uint32_t jsrt_string_length(jsrt_value v);
uint16_t jsrt_string_char(jsrt_value v, uint32_t i);

/* String construction from UTF-8 bytes. */
jsrt_value jsrt_string_from_utf8(const char *bytes, size_t len);

/* String operations: concatenation, equality, and lexicographic comparison. */
jsrt_value jsrt_string_concat(jsrt_value a, jsrt_value b);
bool jsrt_string_equals(jsrt_value a, jsrt_value b);
/* Compare two strings lexicographically by UTF-16 code unit.
 * Returns: <0 if a < b, 0 if a == b, >0 if a > b */
int jsrt_string_compare(jsrt_value a, jsrt_value b);

/* True when v holds a JS Number. A Number has TWO representations once Phase 3's i32 refinement
 * lands (docs/NUMERIC.md §1), and every predicate that compares numbers has to admit both -- so
 * the test lives here rather than being re-spelled at each call site. */
static inline bool jsrt_is_number(jsrt_value v) {
  return jsrt_is_double(v) || jsrt_is(v, JSRT_TAG_INT32);
}

/* The double a Number denotes. Meaningless for values where jsrt_is_number is false. */
static inline double jsrt_number_value(jsrt_value v) {
  return jsrt_is_double(v) ? jsrt_to_double(v) : (double)jsrt_as_int32(v);
}

/* True when v is an OBJECT in the spec's sense -- the ToPrimitive-needing half of the value
 * space, not the JSRT_TAG_OBJECT tag. An array and a function are objects to every abstract
 * operation (`[1] == "1"` is true, `[] + []` is `""`); only the printer cares which tag it is. */
static inline bool jsrt_is_object(jsrt_value v) {
  return jsrt_is(v, JSRT_TAG_OBJECT) || jsrt_is(v, JSRT_TAG_ARRAY) || jsrt_is(v, JSRT_TAG_CLOSURE);
}

/* --------------------------------------------------------- numeric helpers */

/* ToInt32: convert a double to int32_t using the spec algorithm, not a C cast.
 * C cast is undefined behaviour when out of range; this uses fmod for modular wrap. */
int32_t jsrt_to_int32(double d);

/* ToUint32: convert a double to uint32_t using the spec algorithm. */
uint32_t jsrt_to_uint32(double d);

/* ToPrimitive (ECMA-262 §7.1.1, docs/NUMERIC.md §7): the conversion every other abstract
 * operation runs FIRST when handed an object. A primitive passes through untouched.
 *
 * There is no `hint` parameter, and that is a fact about the subset rather than a shortcut: the
 * hint only selects whether `valueOf` or `toString` is tried first, and this subset has neither a
 * user-written `valueOf` nor a `Symbol.toPrimitive` (STA1212, Phase 5). The inherited
 * `Object.prototype.valueOf` returns the object itself -- not a primitive -- so BOTH hints fall
 * through to `toString` for every object that exists here, and the two hints cannot be told apart.
 * Adding user methods is what makes the hint observable; add the parameter then, not before. */
jsrt_value jsrt_to_primitive(jsrt_value v);

/* ToNumber: convert a jsrt_value to a double. An object is run through ToPrimitive first.
 * Handles double, boolean, null, undefined, string, and Int32. */
double jsrt_to_number(jsrt_value v);

/* StringNumericLiteral: parse a string value as a number.
 * Not strtod: rejects trailing garbage, handles hex (0x10 = 16), trims whitespace.
 * Non-ASCII code units -> NaN. */
double jsrt_string_to_number(jsrt_value s);

/* ToBoolean: convert a jsrt_value to a boolean.
 * Falsy: false, +0, -0, NaN, undefined, null, empty string.
 * Truthy: everything else (including "0" and "false" as strings). */
bool jsrt_truthy(jsrt_value v);

/* Loose equality (==): NUMERIC.md §6.3 table.
 * Key: null == undefined is true; null/undefined equal nothing else. */
bool jsrt_loose_equals(jsrt_value a, jsrt_value b);

/* SameValue (Object.is): like === but NaN === NaN and -0 !== +0.
 * Opposite of === on exactly these two inputs. Do not define via ===. */
bool jsrt_same_value(jsrt_value a, jsrt_value b);

/* Nullish test for `??`. Exactly `null` and `undefined` -- NOT the same set as falsy. */
static inline bool jsrt_is_nullish(jsrt_value v) {
  return v == JSRT_NULL || v == JSRT_UNDEFINED;
}

/* ------------------------------------------------------ bitwise operators */

/* The six bitwise operators and `~`, as whole operations rather than pieces the emitter
 * assembles. They live here because each one hides a C hazard that must be got right ONCE:
 *   - shifting a negative signed value left is undefined behaviour;
 *   - right-shifting a negative signed value is implementation-defined;
 *   - converting an out-of-range uint32 back to int32 is implementation-defined.
 * All three are avoided inside these functions by working in uint32 and sign-extending by hand.
 *
 * Every one returns a NUMBER, not an integer: `>>>` in particular can produce a value larger than
 * int32 can hold (docs/NUMERIC.md §4.2). */
jsrt_value jsrt_op_bitand(jsrt_value a, jsrt_value b);
jsrt_value jsrt_op_bitor(jsrt_value a, jsrt_value b);
jsrt_value jsrt_op_bitxor(jsrt_value a, jsrt_value b);
jsrt_value jsrt_op_shl(jsrt_value a, jsrt_value b);
jsrt_value jsrt_op_shr(jsrt_value a, jsrt_value b);
jsrt_value jsrt_op_ushr(jsrt_value a, jsrt_value b);
jsrt_value jsrt_op_bitnot(jsrt_value a);

/* ------------------------------------------------------------- equality */

/* NOT the same as a == b: NaN !== NaN despite bit equality, and +0 === -0 despite bit
 * inequality. Once Phase 3 emits Int32, a number also has two representations. */
bool jsrt_strict_equals(jsrt_value a, jsrt_value b);

/* ------------------------------------------------------ arithmetic operators */

/* The `+` operator: if either operand is a string, ToString both and concatenate;
 * otherwise ToNumber both and add. ECMA-262 §12.8.3. */
jsrt_value jsrt_op_add(jsrt_value a, jsrt_value b);

/* Relational comparison operators: <, >, <=, >=. ECMA-262 §12.10.
 * When BOTH operands are strings, compare lexicographically by UTF-16 code unit.
 * Otherwise, ToNumber both and compare numerically.
 * NaN makes all four operators return false. */
bool jsrt_op_lt(jsrt_value a, jsrt_value b);
bool jsrt_op_gt(jsrt_value a, jsrt_value b);
bool jsrt_op_le(jsrt_value a, jsrt_value b);
bool jsrt_op_ge(jsrt_value a, jsrt_value b);

/* --------------------------------------------------------------- objects */

/* A class instance: a fixed set of named slots, and a pointer to the static description of what
 * those slots ARE. This is `SUBSET.md`'s "C struct with fixed slot offsets" -- the emitter knows
 * every field's index at compile time and reads it directly, with no property lookup and no hash.
 *
 * `JSRTClass` is emitted `static const` per class, one instance per class in the whole program, so
 * comparing two `cls` pointers is a class-identity test -- that is what `instanceof` is.
 * `fields` is only needed to PRINT an object -- `console.log` shows `P { x: 1 }` -- so the names
 * live here once rather than in every instance. */
typedef struct JSRTClass {
  const char *name;           /* the class's own name, as written; "" is not a valid class */
  uint32_t field_count;
  const char *const *fields;  /* field names, in slot order; length is field_count */
  /* The base class's descriptor, or NULL at the root. This IS the prototype chain as far as this
   * subset can observe it: the only question anything asks of it is `instanceof`. The chain is
   * finite because `extends` is a declaration-order relation the frontend already proved acyclic,
   * so the walk below needs no visited set. */
  const struct JSRTClass *parent;
  /* The method table, in slot order, or NULL for a class that participates in no overriding.
   * A subclass's table BEGINS with its base's, in the base's own slot order -- the same prefix
   * property the fields have -- so a slot resolved against the static type of a receiver indexes
   * the same method on every descendant, and an override is a different entry at the same index.
   * The entries are file-scope constants, which is exactly why the table is absent for a class
   * whose methods capture: such a closure is not one constant per class. */
  uint32_t method_count;
  const struct JSRTClosure *const *methods;
} JSRTClass;

struct JSRTClosure;

/* Unlike JSRTArray, the elements ARE a flexible member here, and that is safe for the reason it is
 * unsafe there: an object's slot count is fixed by its class at construction and the subset has no
 * way to add a property, so this allocation never grows and therefore never moves. If dynamic
 * property addition ever lands, it does NOT get to grow this -- it gets an overflow table, or the
 * header's address stops being stable and every boxed reference to it becomes wrong. */
typedef struct JSRTObject {
  const JSRTClass *cls;
  jsrt_value fields[];
} JSRTObject;

/* Every slot starts as `undefined`, which is what a declared-but-unassigned field reads as in
 * JavaScript. The constructor body then assigns the ones it assigns. */
jsrt_value jsrt_object_new(const JSRTClass *cls);

static inline JSRTObject *jsrt_as_object(jsrt_value v) {
  return (JSRTObject *)jsrt_ptr(v);
}

/* Slot access. `slot` is a compile-time constant the emitter got from the class's field list, so
 * these are inline rather than calls: there is no lookup to amortize, only a bounds fact the
 * compiler already proved. They are here rather than open-coded at the emitter so that the layout
 * stays a runtime detail -- the emitter names a slot, never an offset. */
static inline jsrt_value jsrt_object_get(jsrt_value obj, uint32_t slot) {
  return jsrt_as_object(obj)->fields[slot];
}

static inline void jsrt_object_set(jsrt_value obj, uint32_t slot, jsrt_value v) {
  jsrt_as_object(obj)->fields[slot] = v;
}

/* `x instanceof C`. There is exactly one `JSRTClass` per class in the program, so class identity is
 * descriptor identity and each link of the walk is a pointer comparison -- no string compare, no
 * lookup. Walking `parent` is what makes a `Dog` an `Animal`.
 *
 * A non-object answers `false` rather than raising: `1 instanceof C` is false in JavaScript, and it
 * is the RIGHT operand that has to be a constructor, which the frontend proved. Arrays and closures
 * are objects with no `JSRTClass` at all, so the tag test excludes them before any dereference. */
static inline bool jsrt_instanceof(jsrt_value v, const JSRTClass *cls) {
  if (!jsrt_is(v, JSRT_TAG_OBJECT)) {
    return false;
  }
  for (const JSRTClass *c = jsrt_as_object(v)->cls; c != NULL; c = c->parent) {
    if (c == cls) {
      return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------ Map and Set */

/* A Map and a Set are ONE structure under two descriptors, because they differ in exactly two
 * places: a Set ignores the value half of an entry, and the printer writes `1` where a Map writes
 * `'a' => 1`. Everything that is actually hard -- SameValueZero on the keys, insertion order,
 * deletion without disturbing it -- is identical, and writing it twice would mean two chances to
 * get NaN or -0 wrong.
 *
 * `cls` is FIRST, exactly as in JSRTObject, and that prefix is what makes a Map an object: the tag
 * is JSRT_TAG_OBJECT, `jsrt_as_object(m)->cls` is a valid read, and `instanceof` walks it like any
 * other class. The printer tells the two apart by comparing that pointer against the two
 * descriptors below -- there is one of each in the whole program, so it is a pointer compare, the
 * same identity test `instanceof` is.
 *
 * Insertion order is a SPEC guarantee, not a convenience: `console.log` and every iteration form
 * print entries in the order they were first inserted, and re-setting an existing key does not
 * move it. That is why entries live in an append-only array and the hash table holds INDICES into
 * it rather than the entries themselves. A deletion marks its entry dead and blanks both halves
 * (stale bits in a GC-scanned allocation would keep a dead key alive); the dead entries are
 * compacted away the next time the array is full. */
typedef struct JSRTMapEntry {
  jsrt_value key;
  jsrt_value value; /* JSRT_UNDEFINED throughout a Set, which stores keys and nothing else */
  bool live;
} JSRTMapEntry;

typedef struct JSRTMap {
  const JSRTClass *cls; /* &jsrt_class_map or &jsrt_class_set -- prefix-shared with JSRTObject */
  uint32_t size;        /* LIVE entries: what `.size` reports */
  uint32_t used;        /* entries appended, live or dead: entries[0..used) have been written */
  uint32_t capacity;
  JSRTMapEntry *entries;
  /* Open-addressed, linear-probed, holding `entry index + 1` so that 0 means empty. Sized to a
   * power of two at twice `capacity`, which keeps the load factor at or below one half. */
  uint32_t *index;
  uint32_t index_mask;
} JSRTMap;

extern const JSRTClass jsrt_class_map;
extern const JSRTClass jsrt_class_set;

jsrt_value jsrt_map_new(void);
jsrt_value jsrt_set_new(void);

static inline JSRTMap *jsrt_as_map(jsrt_value v) { return (JSRTMap *)jsrt_ptr(v); }

/* True for a Map or a Set -- the test the printer runs before treating an object as a class
 * instance, since both carry the object tag. */
static inline bool jsrt_is_map_or_set(jsrt_value v) {
  if (!jsrt_is(v, JSRT_TAG_OBJECT)) {
    return false;
  }
  const JSRTClass *cls = jsrt_as_object(v)->cls;
  return cls == &jsrt_class_map || cls == &jsrt_class_set;
}

/* `m.get(k)` -- `undefined` for an absent key, which is what JavaScript returns and why the static
 * type of a `.get` is `V | undefined`. */
jsrt_value jsrt_map_get(jsrt_value map, jsrt_value key);

/* `m.set(k, v)` and `s.add(v)` both RETURN THE COLLECTION, which is what makes them chainable. */
jsrt_value jsrt_map_set(jsrt_value map, jsrt_value key, jsrt_value value);
jsrt_value jsrt_set_add(jsrt_value set, jsrt_value key);

bool jsrt_map_has(jsrt_value map, jsrt_value key);
/* `true` when the key was there, `false` when it was not -- the value JavaScript's delete returns. */
bool jsrt_map_delete(jsrt_value map, jsrt_value key);
/* Undefined, the value `clear()` evaluates to -- so a statement that calls it is an ordinary
 * expression rather than one the emitter has to wrap in a comma to give a value to. */
jsrt_value jsrt_map_clear(jsrt_value map);
/* `.size` as a Number, so the emitter never reads the struct field itself. */
jsrt_value jsrt_map_size(jsrt_value map);

/* ---------------------------------------------------------------- arrays */

/* A dense array: `length` contiguous elements, no holes and no property table.
 *
 * `elements` is a separate allocation rather than a flexible array member, because `length` grows
 * (a write past the end extends the array) and a flexible member cannot move without invalidating
 * every `jsrt_value` that boxes this header. The header's address is therefore stable for the
 * array's whole life, which is what lets the emitter hold an array in a frame slot across a push.
 *
 * KNOWN CEILING: no holes. ECMA-262 leaves the indices skipped by `a[5] = v` on a shorter array
 * genuinely ABSENT -- `console.log` prints `<4 empty items>`, not `undefined` -- and a dense buffer
 * has no way to be absent. Rather than fill the gap and print a different program's output,
 * `jsrt_array_set` refuses a write more than one past the end (STA2002). Replacing an element and
 * appending at `length` -- the cases real programs use -- are unaffected. Sparse storage arrives
 * with the object model, and the refusal lifts with it. */
typedef struct JSRTArray {
  uint32_t length;
  uint32_t capacity;
  jsrt_value *elements;
} JSRTArray;

/* Build an array from `count` initial elements; `items` may be NULL when `count` is 0. Returns an
 * already-boxed value because the header is reachable only through it. */
jsrt_value jsrt_array_new(uint32_t count, const jsrt_value *items);

static inline JSRTArray *jsrt_as_array(jsrt_value v) {
  return (JSRTArray *)jsrt_ptr(v);
}

/* `.length` as a Number, so the emitter never reads the struct field itself. */
jsrt_value jsrt_array_length(jsrt_value array);

/* Indexed read and write. Both take the index as a VALUE and convert it here: an index is an
 * arbitrary expression, and only the runtime knows whether it landed on an integer. A read outside
 * the array is `undefined` (ECMA-262, not an error); a write outside it extends the array. */
jsrt_value jsrt_array_get(jsrt_value array, jsrt_value index);
void jsrt_array_set(jsrt_value array, jsrt_value index, jsrt_value element);

/* ------------------------------------------------------------- closures */

/* A captured-variable environment (plan-notes 50).
 *
 * One per scope that owns variables a nested function reads, chained through `parent` so a name
 * resolves to (levels-up, index) — both compile-time constants. The chain is over ENV-BEARING
 * scopes only, not over source nesting: a function that captures nothing contributes no level.
 *
 * `slots` is where the captured variables actually live. The declaring function reads and writes
 * them here rather than in its frame, which is what makes a write the outer function performs
 * after building a closure visible to that closure. */
typedef struct JSRTEnv {
  struct JSRTEnv *parent;
  uint32_t count;
  jsrt_value slots[]; /* C11 flexible array member */
} JSRTEnv;

/* Slots start as `undefined`, so a collection between allocation and the first store never scans
 * uninitialized memory -- the same discipline JSRT_FRAME follows. */
JSRTEnv *jsrt_env_new(JSRTEnv *parent, uint32_t count);

/* A callable.
 *
 * `env` is NULL for a function that captures nothing, and such a closure stays a file-static
 * constant in the generated C -- rung 4a's zero-allocation path, unchanged. A function WITH
 * captures is heap-allocated once per evaluation of its function expression, which is what makes
 * two evaluations close over different variables.
 *
 * `fn` takes the environment even when it is NULL: `jsrt_call` dispatches through this pointer
 * without knowing which kind of closure it holds, so the signature cannot vary between them. */
typedef struct JSRTClosure {
  jsrt_value (*fn)(uint32_t argc, const jsrt_value *argv, JSRTEnv *env);
  uint32_t arity;   /* declared parameters, i.e. Function.prototype.length */
  const char *name; /* "" for an anonymous function */
  JSRTEnv *env;     /* NULL when the function captures nothing */
} JSRTClosure;

static inline jsrt_value jsrt_closure(const JSRTClosure *c) {
  return JSRT_BOX(JSRT_TAG_CLOSURE, (uintptr_t)c);
}

/* Virtual dispatch: the receiver's OWN class answers, which is the whole point -- the slot came
 * from the static type, the entry comes from the dynamic one. The frontend emits this only where
 * it proved the table exists, so a NULL table here is a codegen bug, not a runtime condition. */
static inline jsrt_value jsrt_method(jsrt_value obj, uint32_t slot) {
  return jsrt_closure(jsrt_as_object(obj)->cls->methods[slot]);
}

/* The heap-allocated form, for a function that captures. Returns an already-boxed value because
 * the closure is reachable only through it. */
jsrt_value jsrt_closure_new(jsrt_value (*fn)(uint32_t argc, const jsrt_value *argv, JSRTEnv *env),
                            uint32_t arity, const char *name, JSRTEnv *env);

static inline const JSRTClosure *jsrt_as_closure(jsrt_value v) {
  return (const JSRTClosure *)jsrt_ptr(v);
}

/* JavaScript arity is not C arity: a missing argument is `undefined` and an extra one is dropped.
 * Every generated callee reads its parameters through this, so neither is ever a read past the end
 * of `argv`. */
static inline jsrt_value jsrt_arg(uint32_t argc, const jsrt_value *argv, uint32_t i) {
  return i < argc ? argv[i] : JSRT_UNDEFINED;
}

/* Calling a non-function is a TypeError. Until Phase 6 gives the runtime exceptions, it is fatal --
 * loud and located, rather than a jump through a garbage pointer. */
jsrt_value jsrt_call(jsrt_value callee, uint32_t argc, const jsrt_value *argv);

/* ------------------------------------------------------------- typeof */

/* The string ECMA-262's `typeof` produces, as a C literal with static storage.
 *
 * Seven answers, and two of them are famously not the ones a tag would give: `typeof null` is
 * "object" (the original 1995 bug, now normative), and a callable is "function" even though a
 * function IS an object everywhere else in this header -- which is why this is a switch on the tag
 * and not a call to jsrt_is_object. */
const char *jsrt_type_name(jsrt_value v);

/* `typeof x`. The string, boxed. */
jsrt_value jsrt_typeof(jsrt_value v);

/* ---------------------------------------------------------- boundary checks */

/* STA2001. A value crossing INTO typed code is checked against the type the program claimed for
 * it, and a mismatch is a located runtime error rather than a value the compiled code then reads
 * as if the claim were true (plan.md §0.2, golden rule 4).
 *
 * Each returns `v` unchanged when the check passes, so a check composes as an expression and the
 * emitter can wrap a value in place. `where` is "file.ts:line:col", baked into the generated C as
 * a string literal -- the check knows the source location because the emitter knew it, and nothing
 * has to be reconstructed from a stack at the point of failure.
 *
 * The number check accepts either numeric tag: a double and an int32 are one type to the language,
 * and which one a value happens to be boxed as is the runtime's business, not the program's. */
jsrt_value jsrt_check_number(jsrt_value v, const char *where);
jsrt_value jsrt_check_string(jsrt_value v, const char *where);
jsrt_value jsrt_check_boolean(jsrt_value v, const char *where);

/* --------------------------------------------------------------- output */

void jsrt_print(jsrt_value v);      /* console.log semantics: prints -0 as "-0" */
jsrt_value jsrt_to_string(jsrt_value v); /* ECMA-262 ToString: -0 becomes "0" */

/* ----------------------------------------------------------- exceptions */

/* One pending exception per thread -- return-value + landing-pad style, never setjmp/longjmp
 * (plan.md §2: bad codegen interactions, GC-root problems). The contract with generated C:
 *
 *   - `throw e` compiles to `jsrt_throw(v); goto <pad>;`.
 *   - After every call that can run user code, generated C checks `jsrt_pending()` and jumps to
 *     the nearest landing pad: a catch, a finally, or the function's unwind pad, which pops the
 *     shadow frame and returns. The return VALUE of an unwinding call is JSRT_UNDEFINED and
 *     meaningless -- the pending flag is the channel, not the value.
 *   - A pad that handles the exception calls `jsrt_take_exception()` exactly once, which clears
 *     the flag and hands over the value. Not clearing it would make every later call in the
 *     handler appear to throw.
 *
 * ROOTING INVARIANT: between jsrt_throw and jsrt_take_exception the stored value may be the only
 * reference to a heap object, so the collector must trace the pending slot as a root alongside
 * the frame chain. (Under the current plain-malloc runtime nothing collects, but generated C is
 * written against this contract, not against the allocator of the day.) */
void jsrt_throw(jsrt_value v);
bool jsrt_pending(void);
jsrt_value jsrt_take_exception(void);

/* The pad of last resort: main's. Prints the value to STDERR and exits 1 -- stdout stays clean,
 * which is what the golden runner compares, and the exit code is what Node observably does with
 * an uncaught throw. */
_Noreturn void jsrt_uncaught(void);

/* ------------------------------------------------------- rooting protocol */

/* `env` is how a captured-variable environment stays rooted (plan-notes 50). An env is reachable
 * by tracing a closure, but only once a closure has been built from it and only while that closure
 * is alive -- neither holds between `jsrt_env_new` and the first `jsrt_closure_new`, nor in a
 * function still reading its own captured locals after every closure it made has died. The frame
 * is the unit of the exact root set, so the collector traces `frame->env` alongside the slots.
 * NULL for the overwhelming majority of frames, whose function captures nothing. */
typedef struct JSRTFrame {
  struct JSRTFrame *prev;
  uint32_t count;
  jsrt_value *slots;
  struct JSRTEnv *env;
} JSRTFrame;

extern _Thread_local JSRTFrame *jsrt_frame_top;

void jsrt_frame_init(JSRTFrame *frame);

/* Slots are filled with JSRT_UNDEFINED and only THEN is the frame published to jsrt_frame_top,
 * so a collection triggered mid-prologue can never scan an uninitialized slot. */
#define JSRT_FRAME(n)                                                          \
  jsrt_value _jsrt_slots[(n)];                                                 \
  JSRTFrame _jsrt_frame = {jsrt_frame_top, (uint32_t)(n), _jsrt_slots, NULL};  \
  jsrt_frame_init(&_jsrt_frame);                                               \
  jsrt_frame_top = &_jsrt_frame

#define JSRT_LOCAL(i) (_jsrt_slots[(i)])

/* Publishes this function's own environment as a root, immediately after allocating it. Separate
 * from JSRT_FRAME because the env's own construction may need the frame to already exist. */
#define JSRT_FRAME_ENV(e) (_jsrt_frame.env = (e))

/* A captured variable, `levels` env-bearing scopes out from `e`. `levels` is 0 for the function's
 * own env and counts only scopes that own captured variables, so it is a constant the emitter
 * computes from capture analysis, never a search. */
#define JSRT_ENV_AT(e, levels, i) (jsrt_env_up((e), (levels))->slots[(i)])

static inline JSRTEnv *jsrt_env_up(JSRTEnv *env, uint32_t levels) {
  for (uint32_t k = 0; k < levels; k++) {
    env = env->parent;
  }
  return env;
}

/* INVARIANT: on every path leaving a function -- normal return, early return, landing pad --
 * the count of JSRT_FRAME_POP() executed equals the count of JSRT_FRAME() entered. A skipped
 * pop leaves a frame pointing at dead stack: a crash under a precise GC, and an invisible time
 * bomb under Boehm that only surfaces when §12 lands. */
#define JSRT_FRAME_POP() (jsrt_frame_top = _jsrt_frame.prev)

/* Module-level bindings outlive `main`'s frame -- a function called from anywhere still reads them,
 * and rung 4a has no environment structs to hold them instead -- so they live in a file-static
 * array whose frame is pushed once at startup and deliberately never popped. `JSRT_GLOBAL(i)` is
 * the same kind of lvalue as `JSRT_LOCAL(i)`, in that array rather than on the stack. */
#define JSRT_GLOBALS(n)                    \
  static jsrt_value _jsrt_globals[(n)];    \
  static JSRTFrame _jsrt_global_frame

#define JSRT_GLOBALS_ENTER(n)                          \
  do {                                                 \
    _jsrt_global_frame.prev = jsrt_frame_top;          \
    _jsrt_global_frame.count = (uint32_t)(n);          \
    _jsrt_global_frame.slots = _jsrt_globals;          \
    jsrt_frame_init(&_jsrt_global_frame);              \
    jsrt_frame_top = &_jsrt_global_frame;              \
  } while (0)

#define JSRT_GLOBAL(i) (_jsrt_globals[(i)])

/* ------------------------------------------------------------- lifecycle */

/* Asserts the 48-bit pointer assumption against a real allocation, then initializes the GC.
 * Fails loudly at startup rather than corrupting values on a platform where it does not hold. */
void jsrt_init(void);

#endif /* JSRT_VALUE_H */
