# VALUE.md — the codegen↔runtime value contract

This document is **normative**. `runtime/include/jsrt_value.h` mirrors it exactly; where the two
disagree, this file is right and the header is a bug. Per plan.md §5 Task 2.1, no C may be
emitted before this document merges — everything the emitter writes assumes the layout below.

Four things are specified here, in the order plan.md §2 requires them:

1. the exact bit layout, including how `-0.0` survives;
2. the string struct and its only sanctioned accessors;
3. number→string as shortest-round-trip, byte-identical to Node;
4. the GC rooting protocol, needed by the *first* line of generated C.

---

## 1. Bit layout — NaN boxing

`jsrt_value` is exactly 64 bits (`uint64_t`). It is a plain integer type, never a union and
never a struct: it must pass in a single register and be memcpy-able without ceremony.

```c
typedef uint64_t jsrt_value;
```

A double is stored **as itself**. Everything else hides in the quiet-NaN space:

```
 63   62 .. 52    51     50 .. 48   47 .. 0
┌────┬──────────┬──────┬──────────┬──────────────┐
│sign│ exponent │quiet │   tag    │   payload    │
│ 1  │  0x7FF   │  1   │  3 bits  │   48 bits    │
└────┴──────────┴──────┴──────────┴──────────────┘
```

A value is a **boxed (non-double)** value iff its top 13 bits are all set:

```c
#define JSRT_NANBOX_MASK  UINT64_C(0xFFF8000000000000)
#define jsrt_is_double(v) (((v) & JSRT_NANBOX_MASK) != JSRT_NANBOX_MASK)
```

Note the **sign bit is part of the mask**. Only *negative* quiet NaNs are tags; the entire
positive-NaN space stays available to real doubles. That is what makes rule §1.2 workable.

### 1.1 Tags

| Tag | Name | Payload |
|---|---|---|
| 0 | `Undefined` | zero |
| 1 | `Null` | zero |
| 2 | `Bool` | 0 or 1 |
| 3 | `Int32` | two's-complement `int32_t` in the low 32 bits |
| 4 | `Object` | pointer |
| 5 | `String` | pointer to `JSString` |
| 6 | `Array` | pointer |
| 7 | `Closure` | pointer to `JSRTClosure` |

The tag field is **three bits and completely allocated**. There is no spare tag, and adding one
would take a bit from `JSRT_NANBOX_MASK`, whose width is what keeps the whole positive-NaN space
available to doubles. Anything the runtime needs to make reachable but that is *not* a JavaScript
value — a captured-variable environment, for instance — is rooted structurally instead (§4.3),
never by inventing a tag.

A callable is a `JSRTClosure`. `fn` takes the environment even when there is none, because
`jsrt_call` dispatches through this pointer without knowing whether the closure captures:

```c
typedef struct JSRTClosure {
  jsrt_value (*fn)(uint32_t argc, const jsrt_value *argv, JSRTEnv *env);
  uint32_t     arity;   /* declared parameters, i.e. Function.prototype.length */
  const char  *name;    /* "" for an anonymous function */
  JSRTEnv     *env;     /* NULL when the function captures nothing */
} JSRTClosure;

jsrt_value jsrt_closure_new(jsrt_value (*fn)(uint32_t, const jsrt_value *, JSRTEnv *),
                            uint32_t arity, const char *name, JSRTEnv *env);
```

A function that captures nothing stays a **file-static constant** with `env = NULL` — no
allocation, which is the path rung 4a established and 4b leaves intact. Only a capturing function
is heap-allocated via `jsrt_closure_new`, once per evaluation of its function expression, which is
what makes two evaluations close over different variables.

`arity` is the *declared* parameter count. It never bounds what a call site may pass: JavaScript
drops extra arguments and fills missing ones with `undefined`, so every callee reads parameters
through `jsrt_arg` rather than indexing `argv` directly.

```c
#define JSRT_TAG_SHIFT  48
#define JSRT_PAYLOAD_MASK  UINT64_C(0x0000FFFFFFFFFFFF)
#define JSRT_BOX(tag, payload) \
  (JSRT_NANBOX_MASK | ((uint64_t)(tag) << JSRT_TAG_SHIFT) | ((uint64_t)(payload) & JSRT_PAYLOAD_MASK))

#define JSRT_UNDEFINED  JSRT_BOX(0, 0)
#define JSRT_NULL       JSRT_BOX(1, 0)
#define JSRT_TRUE       JSRT_BOX(2, 1)
#define JSRT_FALSE      JSRT_BOX(2, 0)
```

Tags 4–7 all carry pointers. They are distinct tags rather than one `Ptr` tag plus a header
read because the common operations — "is this a string?", "is this callable?" — must be a
register compare, not a dependent load through a cold pointer.

**Pointer assumption.** The 48-bit payload holds a full pointer only because every platform in
scope (x86-64 and AArch64, user space) leaves the high 16 bits of a valid heap pointer clear.
`jsrt_init()` asserts this against a real heap allocation at startup rather than trusting it
silently. If Stator is ever ported somewhere with 5-level paging enabled for user space or with
the AArch64 top-byte-ignore feature in play, this assumption breaks loudly at startup instead of
corrupting values — that is the entire point of checking it.

Pointer payloads are **not** shifted or sign-extended on the way out; unboxing is a mask:

```c
#define jsrt_ptr(v) ((void *)(uintptr_t)((v) & JSRT_PAYLOAD_MASK))
```

`Int32` is signed, so it *is* re-widened on the way out:

```c
#define jsrt_int32(v) ((int32_t)(uint32_t)((v) & UINT64_C(0xFFFFFFFF)))
```

### 1.2 NaN canonicalization — required, not optional

The tag space is negative quiet NaNs, and on x86-64 the SSE default NaN produced by `0.0/0.0`
is `0xFFF8000000000000` — bit-identical to `JSRT_UNDEFINED`. An arithmetic NaN flowing into a
value slot unfiltered would silently *become* `undefined`.

So every double entering a `jsrt_value` passes through one funnel, which replaces any NaN with
the canonical positive quiet NaN:

```c
#define JSRT_CANONICAL_NAN  UINT64_C(0x7FF8000000000000)

static inline jsrt_value jsrt_number(double d) {
  jsrt_value v;
  memcpy(&v, &d, sizeof v);
  return jsrt_is_double(v) ? v : JSRT_CANONICAL_NAN;
}
```

This is spec-legal: ECMAScript exposes exactly one NaN. No program can observe which bit pattern
it had. **Generated C never bit-casts a double into a `jsrt_value` directly — it always calls
`jsrt_number()`.** The emitter has no exception to this rule, including for literals it believes
cannot be NaN, because the cost is one predictable branch and the failure mode is silent.

`memcpy` is the type-pun, not a union or a pointer cast: it is the only form that is defined
under C11 strict aliasing, and every compiler in scope lowers it to a register move at `-O1`+.

### 1.3 How `-0.0` survives

`-0.0` has the bit pattern `0x8000000000000000`. Masked with `JSRT_NANBOX_MASK` that yields
`0x8000000000000000`, which is not `JSRT_NANBOX_MASK` — so `jsrt_is_double` says *double*, and
it round-trips unchanged. It is never canonicalized (it is not a NaN) and it is never demoted to
`Int32` (see below).

This matters because `Object.is(-0, 0) === false` and `1/-0 === -Infinity` are observable. Both
are decision tests, per plan.md §2.

**The `Int32` demotion rule exists to protect this.** A double may be stored as `Int32` only if
it is integral, within `int32_t` range, **and is not `-0.0`**:

```c
static inline bool jsrt_fits_int32(double d) {
  return d >= -2147483648.0 && d <= 2147483647.0
      && (double)(int32_t)d == d
      && !(d == 0.0 && signbit(d));   /* -0.0 must stay a double */
}
```

The `signbit` clause is the whole reason this helper exists rather than being inlined at each
call site: `(double)(int32_t)(-0.0) == -0.0` is *true*, so the obvious integral test admits
`-0.0` and would quietly turn it into `+0`.

**Phase 2 does not emit `Int32` at all.** Per plan.md §5, the walking skeleton treats all numbers
as `f64`, which is spec-correct; the `i32` fast path arrives in Phase 3 with `NUMERIC.md` as a
pure optimization. The tag is specified now so that turning it on later is a codegen change with
no layout change — and so that `jsrt_strict_equals` is written correctly from the start.

### 1.4 Equality

Because a number has two possible representations (`Int32` and double) once Phase 3 lands,
`===` on two `jsrt_value`s is **not** `a == b`. Bit equality is a fast path, not the definition:

```c
bool jsrt_strict_equals(jsrt_value a, jsrt_value b);
```

The rules it implements: `NaN !== NaN` (so bit-equal canonical NaNs must compare *false*);
`+0 === -0` (so bit-*unequal* values must compare *true*); a number is equal across
representations; everything else is bit equality. Getting `===` from `==` on the raw integer
gets both zero cases and the NaN case wrong, which is why the operator is a function from day 1
even though Phase 2's subset could get away with less.

---

## 2. Strings

```c
typedef struct JSString {
  uint32_t length;   /* in UTF-16 code units, not bytes and not code points */
  uint16_t data[];   /* flexible array member; NOT NUL-terminated */
} JSString;
```

UTF-16 is not negotiable for v0. `String.prototype.length`, `charCodeAt`, `codePointAt`, surrogate
pair handling, and essentially all of Test262's string coverage are defined in UTF-16 code units.
Choosing UTF-8 to save memory would make every one of those operations either wrong or O(n), and
the conversion cost would reappear at every boundary. Revisit only with measurements, via
`plan-notes.md`.

`length` is `uint32_t`, not `size_t`: it caps strings at 4 Gi code units (JS's own limit is lower),
keeps the header 4 bytes so `data` starts 8-byte-aligned after padding, and makes the struct the
same size on both 32- and 64-bit targets.

Generated C touches string contents **only** through these:

```c
uint32_t jsrt_string_length(jsrt_value v);
uint16_t jsrt_string_char(jsrt_value v, uint32_t i);
```

No direct `->data[i]` in emitted code, ever. The indirection is what allows §12's rope or
small-string optimizations to be a runtime-only change. A bounds-check policy lives behind these
accessors too, so it can be compiled out in release builds in one place rather than at thousands
of emitted call sites.

---

## 3. Number → string

**Requirement: byte-identical to the pinned Node.** Golden tests compare stdout with no
tolerance, so this is a correctness requirement, not a formatting preference. "Round to N
decimals" is never an acceptable fix for a mismatch — a mismatch is a bug in this layer.

This splits into two problems that are easy to conflate:

**3.1 Shortest round-trip digits — vendored Ryū.** Given a double, produce the shortest decimal
digit string that parses back to exactly that double. This is `runtime/vendor/ryu/` (plan.md §5
Task 2.5). Do not write this; do not use `printf("%.17g")`, which is neither shortest nor
correctly rounded for this purpose.

**3.2 The surrounding format — ECMA-262 `Number::toString`.** Ryū gives digits and an exponent;
the *shape* of the output is the spec's, and it is not what a C library would print:

| Value | JS output | A naive `%g` would give |
|---|---|---|
| `1e21` | `1e+21` | `1e+21` |
| `1e20` | `100000000000000000000` | `1e+20` |
| `0.000001` | `0.000001` | `1e-06` |
| `0.0000001` | `1e-7` | `1e-07` |

Note both traps: the decimal/exponential threshold is at 1e21 (not the C library's much lower
one), and negative exponents are written `e-7`, with **no zero padding**. These are exactly the
cases where a plausible-looking implementation passes casual testing and fails golden tests.

**3.3 `console.log(-0)` prints `-0` — but `String(-0)` is `"0"`.** These are different
operations. `Number::toString(-0)` is specified to return `"0"`, while Node's `console.log` runs
values through `util.inspect`, which prints `-0` to preserve the distinction for humans.

Golden tests compare `console.log` output, so **`jsrt_print` must implement the inspect rule, not
the `toString` rule** for this case. They are separate functions:

```c
void      jsrt_print(jsrt_value v);            /* console.log semantics */
jsrt_value jsrt_to_string(jsrt_value v);       /* ECMA-262 ToString */
```

The distinction is documented here because it will otherwise be discovered as a one-character
golden-test diff by whoever writes the first `-0` test, and misdiagnosed as a Ryū bug.

---

## 4. GC rooting protocol

Every generated function opens a shadow-stack frame. Every local holding a `jsrt_value` lives in
that frame. Frames pop on **every** exit path — normal return, early return, and landing pads.

```c
typedef struct JSRTFrame {
  struct JSRTFrame *prev;
  uint32_t          count;
  jsrt_value       *slots;
  struct JSRTEnv   *env;    /* this function's own captured-variable environment, or NULL */
} JSRTFrame;

extern _Thread_local JSRTFrame *jsrt_frame_top;

#define JSRT_FRAME(n)                                                        \
  jsrt_value _jsrt_slots[(n)];                                               \
  JSRTFrame  _jsrt_frame = { jsrt_frame_top, (uint32_t)(n), _jsrt_slots, NULL }; \
  jsrt_frame_init(&_jsrt_frame);                                             \
  jsrt_frame_top = &_jsrt_frame

#define JSRT_LOCAL(i)     (_jsrt_slots[(i)])
#define JSRT_FRAME_POP()  (jsrt_frame_top = _jsrt_frame.prev)
#define JSRT_FRAME_ENV(e) (_jsrt_frame.env = (e))
```

`jsrt_frame_init` fills every slot with `JSRT_UNDEFINED` before the frame becomes reachable. The
frame is pushed *after* initialization, so a collection triggered mid-prologue can never scan an
uninitialized slot.

The `env` field is the root for a captured-variable environment (§4.3). A collector traces it
alongside `slots`; it is `NULL` for every frame whose function captures nothing, which is almost
all of them.

### 4.3 Captured-variable environments

A variable read by a nested function cannot live in its declaring function's frame: the frame dies
when the call returns, and the closure may outlive it. Such variables move to a heap `JSRTEnv`,
chained through `parent` so a reference resolves to (levels-up, index) — both compile-time
constants the emitter gets from capture analysis. The chain runs over **env-bearing scopes only**,
not over source nesting, so a function that captures nothing adds no level.

```c
typedef struct JSRTEnv {
  struct JSRTEnv *parent;
  uint32_t        count;
  jsrt_value      slots[];   /* C11 flexible array member */
} JSRTEnv;

JSRTEnv *jsrt_env_new(JSRTEnv *parent, uint32_t count);
```

`jsrt_env_new` fills `slots` with `JSRT_UNDEFINED` before returning, for the same reason
`jsrt_frame_init` does.

Storing captured variables in the env — rather than copying them into each closure — is what makes
a write the declaring function performs *after* building a closure visible through that closure,
which is what the language requires.

**Why the env is rooted by the frame and not by the closure.** Tracing `closure → env → slots`
covers the env only once a closure exists and only while one is alive. Neither holds between
`jsrt_env_new` and the first `jsrt_closure_new`, nor in a function still reading its own captured
locals after every closure it built has died. So the declaring function roots its own env through
`JSRT_FRAME_ENV`. It is *not* a `jsrt_value`: the tag field is three bits and all eight values are
allocated (§2), and widening it would take a bit from `JSRT_NANBOX_MASK`, which exists to keep the
entire positive-NaN space available to doubles. An environment is not a JavaScript value and does
not need to become one. See plan-notes 50.

### 4.1 Why this exists under Boehm, where it does almost nothing

Phase 2 uses Boehm GC, which is conservative: it scans the machine stack and would find these
values anyway. Under Boehm these macros are nearly free and nearly pointless.

They are mandatory regardless, because §12's precise generational GC needs an exact root set. If
codegen is written without the discipline and the discipline is retrofitted later, the retrofit
*is* a codegen rewrite — which is precisely the history plan.md §0.7 cites from Boa. The cost of
maintaining it now is a few macros; the cost of adding it later is the backend.

Consequently: **a frame is opened even when the runtime would not need it.** Uniformity is what
makes the codegen auditable, and plan.md §7 Task 4.5 requires a codegen test that diffs emitted
frames against emitted locals — a test that only works if the rule has no exceptions.

### 4.2 Landing pads

`try`/`catch` lowering (plan.md §6 Task 3.10) uses return-value + landing-pad style, never
`setjmp`/`longjmp`. Every `goto landing_pad_N` runs its scope's cleanup, popping frames in
reverse scope order, before jumping.

The invariant, stated so a reviewer can check it mechanically: **on every path leaving a
function, the number of `JSRT_FRAME_POP()` executed equals the number of `JSRT_FRAME()`
entered.** An unwind path that skips a pop leaves a dangling frame pointing at a dead stack
region — which under a precise GC is a crash, and under Boehm is an invisible time bomb that only
surfaces after §12 lands. This is ASan/UBSan-tested per plan.md §6 Task 3.10.

---

## 4.4 Arrays, and the `console.log` shape they print in

A `JSRTArray` is a header — `length`, `capacity`, `elements`, plus the property table below —
boxed under the `Array` tag. The elements are a SEPARATE allocation rather than a flexible array
member, because the buffer grows and a flexible member cannot move without invalidating every
`jsrt_value` that boxes the header. The header's address is therefore stable for the array's whole
life, which is what lets the emitter hold an array in a frame slot across a push.

### An array with properties

An array can also carry NAMED properties, in the same `shape` + out-of-line `slots` layout §4.10
gives a dynamic object. `shape == NULL` means "no properties", which is every ordinary array: the
table costs one NULL word and no allocation until something writes to it.

One thing needs this, and it is not an optimization: a **RegExp match**. ECMA-262 §22.2.7.2 builds
the answer of `exec` as an array of the capture groups that ALSO has `index`, `input` and `groups`
on it, and `console.log` prints them — `[ '12-ab', '12', 'ab', index: 0, input: '12-ab', groups:
undefined ]`. A dense buffer alone cannot hold that, which is why `exec` and `String.prototype.match`
were deferred until this landed (plan.md §7 Task 4.1).

The consequences worth stating:

- **Indices never enter the table.** They live in `elements`, and a match is dense over its groups,
  so the two spaces do not overlap. `jsrt_shape_property_count` therefore counts named properties
  only, and `console.log` prints them after the elements, as Node does.
- **One code path, two receivers.** `jsrt_get_prop`/`jsrt_set_prop` walk a `PropTable` view that a
  dynamic object and an array both expose (`runtime/src/jsrt_shape.c`), so `m.index` resolves
  through the same shape chain and the same per-site inline cache an `o.x` does. A cache filled at
  one site stays valid however the value was built.
- **`groups` has a NULL PROTOTYPE**, and Node says so when it prints one: `[Object: null prototype]
  { w: 'a' }`. The layout is a dynamic object's exactly; a second class descriptor
  (`jsrt_class_null_proto`) is the only difference, and it exists so the printer can tell them apart
  by pointer. `jsrt_is_dynobj` answers true for both.
- **Grouping is off** for an array with properties, the rule Node applies to objects: its
  `groupArrayElements` is reached only for array-like output.

Two ceilings are deliberate and recorded rather than hidden:

- **No holes.** `jsrt_array_set` refuses a write more than one past the end (`STA2002`, raised at
  runtime). ECMA-262 leaves the skipped indices absent, and a dense buffer cannot be absent;
  filling them with `undefined` would make `console.log` print a different program's output.
- **A read out of range is `undefined`**, which is why `noUncheckedIndexedAccess` types `a[i]` as
  `T | undefined` and the HIR types it `Unknown` until Task 3.5 narrows it (plan-notes 53).

### The inspect constants

`console.log` on an array is `util.inspect`, not `ToString`, and `jsrt_print` reproduces Node's
formatting byte-for-byte. The constants are Node's defaults, verified empirically against the
pinned Node rather than read out of documentation, and `runtime/tests/print_arrays.{c,mjs}` is the
paired corpus that holds them:

| Constant | Value | What it controls |
|---|---|---|
| `breakLength` | 80 | The column at which a single-line array becomes a multi-line one |
| `depth` | 2 | Below this, a nested array prints as `[Array]` |
| `maxArrayLength` | 100 | Entries printed before `... n more items` |
| `compact` | 3 | Feeds `groupArrayElements`, which packs more than six entries into aligned columns |
| separator space | 2 | The `, ` between entries, which counts toward every width test |

One simplification is worth stating so it does not read as a missing check: Node guards grouping
with `ctx.currentDepth - recurseTimes < ctx.compact`, and with a depth cap of 2 and `compact` of 3
that comparison is **always** true, so it is omitted rather than translated.

Column alignment follows the element types: a run of numbers is right-aligned (`padStart`), and
anything else left-aligned (`padEnd`).

## 4.5 Class instances, and why they print differently from arrays

A `JSRTObject` is a pointer to a `JSRTClass` descriptor followed by its slots, boxed under the
`Object` tag. Unlike `JSRTArray`, the slots ARE a flexible array member — one allocation, not two —
and that is safe here for the reason it is unsafe there: the slot count is fixed at construction
and nothing in this subset adds a property, so the buffer never grows and the header's address
never has to move.

The descriptor is `static const` and file-scope, one per class declaration, shared by every
instance: the class name, the slot count, the field names in slot order, and the base class's
descriptor (`NULL` at the root of a chain). An instance therefore costs a pointer plus its fields,
a field read is an offset load, and `instanceof` walks the parent links comparing descriptor
pointers (`jsrt_instanceof`, rung 6b): one class, one descriptor, so class identity and pointer
identity are the same fact at every link. Anything that is not an object with a descriptor — a
primitive, an array, a closure — answers `false` at the tag test, before any dereference.

A static member is not in the descriptor either, and not in any instance: it is one ordinary
binding for the whole program, named after the class that declares it. Nothing about a class is
per-instance except its slots.

The parent link is the prototype chain as far as this subset can observe it, and `instanceof` is
the only thing that asks. Field access never walks it: a subclass's slots BEGIN with its base's, in
the base's own slot order, so a base-typed read of a subclass instance is the same offset load it
would be on a base instance. Inheritance costs a pointer in the descriptor and nothing per
instance.

A method is not in the object. One function is shared by every instance, with the receiver passed
as argument zero under the ordinary closure ABI. Putting methods in slots would cost one closure
per method per object and turn every call into an indirect one.

Where a method is overridden the descriptor carries a METHOD TABLE: `method_count` entries, each a
pointer to a file-scope `JSRTClosure`, in the same prefix order the fields have — a subclass's table
begins with its base's, so a slot resolved against a receiver's static type indexes the right method
on every descendant, and an override is a different entry at the same index (`jsrt_method`). The
table is per class, not per instance, so overriding costs a pointer and a count in the descriptor
and nothing per object. A class nothing overrides has no table at all (`method_count` 0, `methods`
NULL) and keeps the compile-time-resolved direct call: the frontend decides which of the two a call
site is, and only ever emits the load where it proved the table exists.

An accessor is not in the object either, and not in the descriptor's field list: `get x`/`set x` are
member functions like any other, so a class with accessors keeps the fixed-slot layout of its actual
fields. That is also why an accessor does not print — `util.inspect` shows slots, and there is no
slot.

An unassigned slot reads as `undefined` because that is what it HOLDS. That is a value, not an
absence — so the key still prints, which is the observable difference from a property that was
never declared.

### What inspect does differently for an object

`runtime/tests/print_objects.{c,mjs}` is the paired corpus, and it pins four behaviours that the
array constants in §4.4 do not predict:

- **The class name is inside the 80-column budget**, not merely printed in front of it. The same
  single field under `S` fits on one line and under `AVeryLongClassNameIndeed` does not.
- **Objects never group.** `groupArrayElements` is array-only, so eight fields are eight lines
  where eight array elements would be a grid.
- **Past the depth cap an object prints as `[ClassName]`**, not `[Object]`.

- **`#private` fields do not print.** A field name in the descriptor that begins with `#` is
  skipped, which is the whole implementation of privacy below the gate: the checker has already
  rejected every access from outside the class body, so the printer is the only place the
  distinction is still observable. The names stay in the descriptor because slot *i* of the class
  must be slot *i* of the descriptor.

A class with no fields — and a class whose fields are ALL `#private` — prints as `Name {}`. `ToString` of an object is still `[object Object]`,
which is a different operation from what `console.log` does — a distinction the golden fixture
`tests/golden/ts/classes.ts` checks in both directions.

---

## 4.6 Map and Set — one table, two descriptors

The tag field is fully allocated (§1.1), so a Map cannot have a tag of its own. It does not need
one: a Map is an `Object`-tagged pointer whose first word is a `const JSRTClass *`, exactly like a
class instance, and the descriptor pointer is what says which builtin it is. Two file-scope
descriptors exist for the whole program — `jsrt_class_map` and `jsrt_class_set` — so the test is a
pointer comparison, the same one `instanceof` makes.

```c
typedef struct JSRTMapEntry { jsrt_value key; jsrt_value value; bool live; } JSRTMapEntry;
typedef struct JSRTMap {
  const JSRTClass *cls;   /* &jsrt_class_map or &jsrt_class_set — the prefix every object shares */
  uint32_t size;          /* LIVE entries: what `.size` answers */
  uint32_t used;          /* entries appended, dead ones included: where the next one goes */
  uint32_t capacity;
  JSRTMapEntry *entries;  /* dense, in insertion order — this is why iteration order is insertion order */
  uint32_t *index;        /* open-addressed probe table of (entry index + 1), 0 meaning empty */
  uint32_t index_mask;
} JSRTMap;
```

A Set is the same struct with the value half unused, which is the whole reason there is one
implementation rather than two: the only comparison either needs is SameValueZero.

**SameValueZero** is `===` except that `NaN` finds itself, and `Object.is` except that `-0` finds
`+0`. Both differences are reachable from ordinary arithmetic (`0/0`, `-0`), so the hash has to
agree with the comparison on both: a number key is normalized to a double with `-0` folded to `+0`
and every NaN folded to the canonical one (§1.2), a string is hashed FNV-1a over its UTF-16 units,
and anything else hashes by box identity — which is exactly what identity comparison means for an
object key, with no object model involved.

`index` is kept at least twice `capacity`, so the load factor stays ≤ ½ and linear probing does not
degrade. Growth compacts: dead entries are dropped, the survivors keep their relative order, and the
probe table is rebuilt. A delete blanks the entry's key and value and clears `live` rather than
moving anything, so **insertion order survives a delete-and-reinsert** — the reinsert appends at the
end, it does not reclaim the hole.

`console.log` of either prints through the same `util.inspect` rules objects use, with two
differences pinned by `runtime/tests/print_maps.{c,mjs}`:

- The prefix `Map(n) ` / `Set(n) ` counts toward the 80-column budget, the way a class name does.
- Map and Set entries **never group**. `groupArrayElements` is array-only, so eight entries are
  eight lines where eight array elements would be a grid.

---

## 4.7 `typeof`, and the two places the tag is not the answer

`jsrt_type_name` is a switch on the tag, and it has to be one rather than a derivation, because
ECMA-262 disagrees with this layout twice:

- **`typeof null` is `"object"`.** The 1995 bug that shipped and then became normative. No
  structural route to the `Null` tag gives that answer, so it is asserted.
- **A closure is `"function"`.** Everywhere else in this header a closure IS an object —
  `jsrt_is_object` says so, and so does every operation that takes one. `typeof` is the single
  place the language separates callable from not.

The numeric case is a property of the boxing rather than of the language: a value is a number if it
is an unboxed double OR carries the `Int32` tag, and a real NaN reaches the switch as a double
(the quiet-NaN space holds the tagged values, not NaN itself), so it answers `"number"` correctly
without a special case. `runtime/tests/print_typeof.c` pins every one of these against Node.

## 4.8 Boundary checks — `jsrt_check_*` and STA2001

The check family is `jsrt_check_number`, `jsrt_check_string` and `jsrt_check_boolean`: each returns
its argument on success, so a check composes as an expression and the emitter wraps a value in
place, and each calls `jsrt_panic` on failure with `STA2001` and the `file:line:col` the emitter
baked in as a string literal.

Deliberately three. A tag settles these in constant time; an object's shape, an array's element
type and a function's signature do not, and a "check" that walked an array would turn an O(1)
narrowing into an O(n) one silently. Narrowings to those types are left on the dynamic path instead
(docs/HIR.md §3.2.1).

Failure ABORTS rather than returning an error value. That is the whole contract: everything the
compiler emits downstream of a check is entitled to trust the type completely, and a check that
could be ignored would make that entitlement false.

---

## 4.9 Exceptions — the pending cell and the landing-pad protocol (Task 3.10)

Exceptions are return-value + landing-pad style, never `setjmp`/`longjmp` (plan.md §2: bad codegen
interactions, GC-root problems). The runtime's entire contribution is a mailbox — one value and one
flag, thread-local, in `runtime/src/jsrt_throw.c`:

- `jsrt_throw(v)` stores the value and raises the flag. Overwriting an already-pending exception is
  legal and REQUIRED: a throw inside a `finally` replaces the completion that got the finally
  running, and the generated code relies on the newest throw winning.
- `jsrt_pending()` reads the flag. Generated C checks it after every operation that can run user
  code — `jsrt_call` in all its spellings — and jumps to the nearest landing pad. The return VALUE
  of an unwinding call is `JSRT_UNDEFINED` and meaningless; the flag is the channel.
- `jsrt_take_exception()` clears both and hands over the value. A pad that handles the exception
  takes exactly once; not taking would make every later call in the handler appear to throw.
- `jsrt_uncaught()` is main's pad of last resort: prints `Uncaught <value>` to STDERR (stdout stays
  clean for the golden comparison) and exits 1, which is what Node observably does.

Everything else about exceptions — which catch receives one, the order finally blocks run in, how
frames pop on the way out — is a property of the GENERATED C, decided by the emitter where the
scope structure is known (docs/HIR.md §1.3 `TryStatement`). Two invariants tie it to this section:

- **Frames pop on every exit path, landing pads included.** A function with no enclosing try gets
  one `_jsrt_unwind` pad that does `JSRT_FRAME_POP(); return JSRT_UNDEFINED;` — emitted only when
  something in the unit can actually throw.
- **The pending slot is a GC root.** Between throw and take the cell may hold the only reference
  to a heap object, so a precise collector must trace it alongside the frame chain (§4). Under
  conservative Boehm today the invariant is latent, the same way it is for §12's plans.

---

## 4.10 Dynamic objects — the shape table and inline caches (Task 4.1)

The representation for an object whose property set is **not a compile-time layout**: optional
properties, index signatures, and — from Phase 5 — untyped receivers. Boa's lesson, taken as
design: ICs matter exactly where types are unknown, so the compiled path never touches any of
this — a typed field access is a struct offset load into `JSRTObject`, no cache, no shape.

**The shape chain.** A `JSRTShape` is one link of a property history: `parent` is the shape
before `key` was added, `offset` is the slot the addition claimed. The root (no properties, NULL
key) is a static singleton; everything else is allocated on first use and lives forever — shapes
are program-lifetime metadata, never freed, never moved, so a cached shape pointer can never
dangle. Transitions ("from this shape, adding this key leads to that shape") hang off the parent
as a linked list of children, and **reuse-before-allocate is the invariant that makes sharing
real**: two objects that gain the same keys in the same order land on the *same* shape.

**The object.** `JSRTDynObject` is prefix-shared with `JSRTObject` (`cls` first, pointing at the
marker descriptor `jsrt_class_dynamic`), so the Object tag covers it and the printer, `typeof`,
truthiness and `instanceof` all see an ordinary object. Its name is `""` — a dynamic object IS a
plain object, and prints like a literal (`{ a: 1 }`), because Node cannot tell them apart. Slots
are **out of line**, unlike a fixed-shape object's, because property addition grows them
(doubling from 4) and the header's address must stay stable — every boxed reference is that
address. Under Boehm the slots are a collected, scanned allocation; the shapes hold no values and
use plain malloc either way.

**The inline cache.** One `JSRTIC { shape, offset }` per property-access *site*, emitted `static`
in generated C. The whole protocol is two rules:

- A cache is filled **only from a hit** against the object's current shape, so
  `ic->shape == o->shape` alone proves `ic->offset` is the site's key's slot — the key is fixed
  at compile time, and same shape means same layout. A hit is one pointer compare and one load.
- A get **miss is never cached**: the object can gain the key later under a different shape, and
  a cached "absent" would keep answering `undefined` after the property exists.

Reading a property the object lacks *is* `undefined` — that is the semantics of an optional
property, not an error. A set of an existing key overwrites in place (shape unchanged); a set of
a new key takes or builds a transition and moves the object's shape. Transitions are not
IC-cached: each object performs a given addition once, so a transition cache pays only across
objects — worth building when Phase 5 measures construction-heavy dynamic code, not before.

The subset has no `delete`, so shapes need no removal edges; when deletion lands it gets a
dictionary-mode escape, not shape surgery. Keys are `const char *` with program lifetime
(generated C passes string literals; the shape table stores the pointer and compares by pointer
first, `strcmp` as the backstop for one key spelled at two sites). Dynamic property access on
anything that is not a dynamic object panics `STA4058` — loudly unimplemented until Phase 5 gives
fixed-shape objects, primitives and nullish receivers their deliberate dynamic paths, never
silently wrong.

Pinned by `runtime/tests/print_shapes.{c,mjs}`: insertion-order printing through the chain,
overwrite-in-place, undefined-on-miss, shared-IC reads across shape-sharing objects, the
stale-cache miss after a transition, divergent histories landing on different shapes, and
non-identifier keys printing quoted (`{ 'a-b': 1 }`).

## 5. What Phase 2 actually implements

The layout above is complete, but the walking skeleton uses only part of it. Recorded so the gap
reads as scheduling, not omission:

| Specified here | Phase 2 | Later |
|---|---|---|
| Double, `Bool`, `Undefined`, `Null`, `String` | yes | — |
| `Int32` tag | layout only, never emitted (but `jsrt_type_name` handles it, §4.7) | Phase 3 (`NUMERIC.md`) |
| `Array` tag + `JSRTArray` | yes, from rung 5 (§4.4) | — |
| `Object` tag + `JSRTClass`/`JSRTObject` | yes, from rung 6a (§4.5); `instanceof`, inheritance, statics, `#private`, method tables, accessors and object-literal shapes from rung 6b; `JSRTMap` from rung 7 (§4.6); `JSRTDynObject` shape table + ICs from Task 4.1 (§4.10) | frontend consumers of the dynamic path: Phase 5 |
| `Closure` tag + `JSRTClosure` | yes, from rung 4a | — |
| `JSRTEnv` + `JSRT_FRAME_ENV` | yes, from rung 4b | — |
| `jsrt_string_length` / `_char` | yes | — |
| Ryū + `Number::toString` format | yes | — |
| `JSRT_FRAME` / `JSRT_LOCAL` | yes, from the first emitted function | — |
| `jsrt_typeof` / `jsrt_check_*` | yes, from Task 3.5 (§4.7, §4.8) | `jsrt_check_*` for shapes: needs Task 4.1 |
| Landing-pad frame discipline | yes, from Task 3.10 (§4.9): pads take the pending exception, unwind pads pop | — |
| Boehm GC | yes | precise generational, §12 |
