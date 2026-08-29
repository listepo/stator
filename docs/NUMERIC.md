# NUMERIC.md — numeric semantics contract

**Normative.** Where this document and the code disagree, this document is right and the code is a
bug. Written before general arithmetic lowering (plan.md §6 Task 3.2), because every decision below
is one that is cheap to make now and expensive to discover from a failing golden test later.

The one-sentence summary: **every JavaScript number is an IEEE-754 double, and `i32` is an
invisible optimization that must never be observable.** Every rule in this document exists to keep
that second clause true.

## Contents

1. [The two representations](#1-the-two-representations)
2. [Promotion and demotion](#2-promotion-and-demotion)
3. [Arithmetic operators](#3-arithmetic-operators)
4. [Bitwise operators and `ToInt32`/`ToUint32`](#4-bitwise-operators-and-toint32touint32)
5. [`-0`, `NaN`, and `Object.is`](#5--0-nan-and-objectis)
6. [Comparison and equality](#6-comparison-and-equality)
7. [`ToPrimitive` and the dynamic path](#7-toprimitive-and-the-dynamic-path)
8. [Number → string](#8-number--string)
9. [What passes may and may not do](#9-what-passes-may-and-may-not-do)
10. [Decision tests](#10-decision-tests)
11. [Phase scope](#11-phase-scope)

---

## 1. The two representations

A value of HType `number` is stored one of two ways:

| Representation | Encoding | HType |
|---|---|---|
| `f64` | an IEEE-754 double, unboxed in compiled code, NaN-boxed as itself in a `jsrt_value` | `number` |
| `i32` | a signed 32-bit integer, unboxed in compiled code, `JSRT_TAG_INT32` in a `jsrt_value` | `number` (refinement `i32`) |

**Both have HType `number`.** `i32` is a *refinement* the compiler tracks, not a second type.
Nothing a program can write distinguishes them — no `typeof`, no equality, no formatting, no
property. That is the whole contract, and §9 is what enforces it.

### 1.1 Why bother

`i32` exists because loop counters, array indices, and bitwise code are the hot paths where the
generated C would otherwise do double arithmetic and a conversion per index. A compiler that keeps
`for (let i = 0; i < n; i++)` in machine integers is doing the one optimization that matters most
for the code people actually write.

### 1.2 Why it is dangerous

The danger is not arithmetic — it is that `double` and `int32_t` disagree about three things that
JavaScript can observe:

- `-0` exists as a double and does not exist as an `i32`;
- `NaN` and the infinities exist as doubles and do not exist as an `i32`;
- doubles hold integers exactly only up to 2^53, while `i32` wraps at 2^31.

Every rule in §2 is a consequence of one of those three.

---

## 2. Promotion and demotion

### 2.1 Demotion (`f64` → `i32`) is conditional and never silent

A double may be represented as `i32` only when `jsrt_fits_int32` (in `runtime/include/jsrt_value.h`)
returns true:

```c
d >= -2147483648.0 && d <= 2147483647.0 && (double)(int32_t)d == d && !(d == 0.0 && signbit(d))
```

The last clause is the one that is easy to omit and fatal to omit. `(double)(int32_t)(-0.0)` is
`-0.0`, so `-0.0` passes the obvious integral test and would be demoted to the `i32` `0` — after
which `Object.is(-0, 0)` returns `true` and `1 / -0` returns `+Infinity`. Both are wrong, both are
observable, and neither shows up in any test that only checks arithmetic results.

**`-0.0` is never `i32`.** It is the reason this function is not one line.

### 2.2 Promotion (`i32` → `f64`) is always allowed and always exact

Every `int32_t` is exactly representable as a double, so promotion is lossless and needs no guard.
When an operation has one operand of each representation, promote and do the operation in `f64`.

### 2.3 Overflow promotes; it does not wrap

```js
2147483647 + 1   // 2147483648, NOT -2147483648
```

JavaScript has no integer overflow. When an `i32` operation would overflow, the result is the `f64`
value, and the result's representation is `f64`. In generated C this means an `i32` add is not a
bare `int32_t` add: signed overflow is undefined behaviour in C, and UBSan will say so. Emit either
a checked add (`__builtin_add_overflow`) that falls back to the double path, or do the arithmetic
in `int64_t` and demote per §2.1.

> `__builtin_add_overflow` and friends are available in clang and gcc. Stator builds with clang
> (`runtime/Makefile`), so using them is not a portability compromise.

### 2.4 The choice of representation is a compiler decision, not a source-level one

A literal `0` may be `i32` or `f64`; the compiler picks. What it may **not** do is pick differently
in a way a program can see — see §9.

---

## 3. Arithmetic operators

For operands both of HType `number` (the static path):

| Operator | i32 ⊕ i32 | otherwise |
|---|---|---|
| `+` `-` `*` | `i32` with overflow check (§2.3); promote on overflow | `f64` |
| `/` | **always `f64`** | `f64` |
| `%` | `i32` when both operands are `i32` **and** the right operand is not `0` | `f64` |
| unary `-` | **always `f64`** unless the operand is a non-zero `i32` | `f64` |

Three of those rows have a trap in them.

### 3.1 `/` is never integer division

`1 / 2` is `0.5`, and `1 / 0` is `Infinity`. There is no `i32` division in JavaScript. Emitting a C
`/` on two `int32_t` gives `0` and a division-by-zero crash respectively — two of the most damaging
possible bugs, because the first is silent. **`/` always produces `f64`**, whatever its operands
are.

### 3.2 `%` needs the zero guard for the same reason

`5 % 0` is `NaN` in JavaScript and undefined behaviour in C. The `i32` path is only valid when the
divisor is a non-zero `i32`; otherwise do it in `f64`, where `fmod` gives `NaN` correctly.

`%` is also *not* `fmod` in sign behaviour for negative operands — it is, actually: JavaScript's `%`
takes the sign of the dividend, which is exactly C's `fmod`. C's integer `%` agrees too. This one is
safe; it is listed here so the next reader does not have to re-derive it.

### 3.3 Unary `-` is where `-0` is born

`-x` where `x` is the `i32` `0` must produce `-0.0`, an `f64`. An `i32` negation would produce the
`i32` `0` and lose the sign. Also, negating the `i32` `-2147483648` overflows (§2.3).

So: unary `-` produces `f64` unless the operand is a non-zero `i32` other than `INT32_MIN`.

### 3.4 `+` on non-numbers is not arithmetic

`+` is overloaded: if either operand is a string, it concatenates. If either operand is `Unknown`,
the operator cannot be resolved statically and lowers to a runtime helper that implements the spec's
`ToPrimitive` → "if either is a string, concatenate, else add" rule (§7). Only when *both* operands
are statically HType `number` does the table above apply.

---

## 4. Bitwise operators and `ToInt32`/`ToUint32`

`& | ^ << >> >>> ~` are defined by the spec as: convert each operand with `ToInt32` (or `ToUint32`
for `>>>`'s left operand), operate on 32 bits, convert back.

**The conversion applies to the operand's VALUE, not to its representation.** This is the rule that
makes the `i32` refinement safe to skip and unsafe to assume:

- An operand already `i32` needs no conversion — that is the fast path, and it is why bitwise code
  benefits most from the refinement.
- An operand that is `f64` gets a real `ToInt32`, which is **not** a C cast. See §4.1.
- An operand that is `Unknown` gets a runtime `ToInt32` on whatever it turns out to be.

### 4.1 `ToInt32` is modular, not saturating, and not a C cast

```
ToInt32(x):
  if x is NaN, +0, -0, +Infinity, or -Infinity  ->  +0
  let i = sign(x) * floor(abs(x))          # truncate toward zero
  let n = i modulo 2^32                    # mathematical modulo, always non-negative
  if n >= 2^31, return n - 2^32
  return n
```

`(int32_t)someDouble` in C is **undefined behaviour** when the double is out of `int32_t`'s range —
not implementation-defined, undefined. On x86-64 it happens to produce `INT32_MIN`; the spec wants
the modular wrap. So:

```js
2147483648 | 0    // -2147483648   (wraps)
1e21 | 0          // -559939584    (modular; a C cast is UB, and gives INT32_MIN on x86-64)
1e10 | 0          //  1410065408   (same, for a value that fits in int64 but not int32)
4294967296 | 0    //  0            (exactly 2^32 — wraps to zero, not to INT32_MAX)
NaN | 0           //  0
Infinity | 0      //  0
```

Note the sign on `1e21 | 0`. The modular result lands above `2^31`, so the final step subtracts
`2^32` and the answer is negative. Deriving these by hand is exactly how a wrong constant gets into
a test; every value above was read off the pinned Node, not reasoned out.

Implement `ToInt32` as a runtime function (`jsrt_to_int32`) that does the range checks and the
`fmod`-based wrap. Do not emit a C cast for it, ever. UBSan will catch the ones that reach a test;
the ones that do not reach a test are the problem.

### 4.2 `>>>` is the only operator that can produce a number `i32` cannot hold

`ToUint32` produces a value in `[0, 2^32)`. Values above `2^31 - 1` do not fit in `int32_t`, so:

```js
(-1 >>> 0) === 4294967295          // true — result is f64, not i32
(0xFFFFFFFF >>> 0) === 4294967295  // true
```

`>>>` produces `i32` only when the result is `< 2^31`; otherwise it produces `f64`. Getting this
wrong yields `-1`, which is a very believable wrong answer.

### 4.3 Shift counts are masked to 5 bits

`x << 32` is `x`, not `0` — the spec masks the shift count with `& 31`. C leaves shifts by ≥ the
width undefined. Mask explicitly; do not rely on the hardware doing it.

`x >> 31` and `x >> 32` differing is a real observable behaviour, not an edge case nobody writes:
it appears in hash functions constantly.

---

## 5. `-0`, `NaN`, and `Object.is`

### 5.1 `-0`

`-0` is a distinct double from `+0` and JavaScript exposes the difference in exactly four places:

| Expression | Result | Why |
|---|---|---|
| `Object.is(-0, 0)` | `false` | SameValue distinguishes them |
| `1 / -0` | `-Infinity` | division carries the sign |
| `Math.sign(-0)` | `-0` | |
| `console.log(-0)` | `-0` | Node's inspect rule; `String(-0)` is `"0"` (§8) |

`-0 === 0` is `true`. `-0 == 0` is `true`. Sorting, indexing, and `Map`/`Set` keys use SameValueZero,
which treats them as equal. So the sign survives in the value and disappears in most comparisons —
which is precisely why a demotion that quietly loses it (§2.1) is not caught by ordinary tests.

### 5.2 `NaN`

There is exactly one observable NaN. Arithmetic NaNs from different sources are indistinguishable to
a program, which is what makes `jsrt_number`'s canonicalization legal (see `docs/VALUE.md` §1.2:
x86-64's default NaN is bit-identical to `JSRT_UNDEFINED`, so canonicalization is not an
optimization, it is a correctness requirement).

`NaN !== NaN`. This is why `jsrt_strict_equals` is a function and not `a == b` on the raw
`jsrt_value` bits: two canonical NaNs *are* bit-identical, and comparing the bits would report
`true`.

`Object.is(NaN, NaN)` is `true` — SameValue differs from `===` here in the opposite direction from
`-0`. The two functions disagree on exactly two inputs, and each disagrees in a different direction:

| | `===` | `Object.is` (SameValue) | SameValueZero |
|---|---|---|---|
| `NaN`, `NaN` | `false` | **`true`** | `true` |
| `-0`, `+0` | `true` | **`false`** | `true` |

Three predicates, three answers. Implement all three separately; do not define one in terms of
another with a patch.

---

## 6. Comparison and equality

### 6.1 Relational operators on numbers

`< > <= >=` on two `number` operands are IEEE comparisons. Every one of them is `false` when either
operand is `NaN` — including `NaN <= NaN`. Note that `!(a < b)` is **not** `a >= b` when `NaN` is
involved; an optimizer that rewrites one into the other is wrong (§9).

Both operands `i32` → C integer comparison. Otherwise promote to `f64` and use C's floating
comparison, which already has the NaN behaviour the spec wants.

### 6.2 Strict equality (`===`)

For two `number` operands: numeric equality, so `+0 === -0` is `true` and `NaN === NaN` is `false`.
Cross-representation is fine — promote the `i32` and compare — because the `i32`↔`f64` split is
invisible (§1).

For operands of different HType: `===` is `false` without any conversion. When either operand is
`Unknown`, it lowers to `jsrt_strict_equals`.

### 6.3 Loose equality (`==`) for primitives

The full table, for the primitive types Stator's HTypes cover:

| left \ right | number | string | boolean | undefined | null |
|---|---|---|---|---|---|
| **number** | `===` | `ToNumber(right)` then `===` | `ToNumber(right)` then `===` | `false` | `false` |
| **string** | `ToNumber(left)` then `===` | `===` | `ToNumber` both, then `===` | `false` | `false` |
| **boolean** | `ToNumber(left)` then `===` | `ToNumber` both, then `===` | `===` | `false` | `false` |
| **undefined** | `false` | `false` | `false` | `true` | **`true`** |
| **null** | `false` | `false` | `false` | **`true`** | `true` |

Two things to notice. `null == undefined` is `true` while `null === undefined` is `false`, and that
is the *only* cross-type pair that is loosely equal without conversion. And `null == 0` is `false`
even though `Number(null)` is `0` — the table short-circuits before any conversion, so `null` and
`undefined` are loosely equal to each other and to nothing else.

`ToNumber(boolean)`: `true` → `1`, `false` → `0`.
`ToNumber(string)`: the spec's `StringNumericLiteral` grammar — whitespace trimmed, empty string
is `0`, `"0x10"` is `16`, `"Infinity"` is `Infinity`, anything unparseable is `NaN`. It is **not**
`strtod`: `strtod("")` is `0` with no characters consumed, and `strtod` accepts trailing garbage
that the spec rejects. Implement it as `jsrt_string_to_number` with the spec's grammar.

### 6.3.1 Objects: identity, or conversion — never both

Two more rows, for the object types (a class instance, an array, a function — §7 treats all three
alike):

| left \ right | object | number / string / boolean | undefined | null |
|---|---|---|---|---|
| **object** | `===` (identity, **no conversion**) | `ToPrimitive(object)` (§7), then re-run the table | `false` | `false` |

Object-against-object is reference identity, so two arrays with equal elements are not loosely
equal, and — the case an implementation is most likely to omit, because every other row is about
conversion — **an object is loosely equal to itself**. Omit that row and `a == a` answers `false`
while `a === a` answers `true`, which no pair of operators may ever disagree on this way.

Object-against-primitive converts the object and asks again. The recursion terminates because
`ToPrimitive` of an object is a string, and no row sends a string back to an object.

The `null`/`undefined` columns still short-circuit: `[] == null` is `false`, even though `[]`
converts to `""` and `"" == 0` is `true`. Nothing converts before that check.

### 6.4 Where these rules live

`==` and `!=` lower to `jsrt_loose_equals` (`runtime/src/jsrt_numeric.c`), which implements §6.3's
table row for row; `ToPrimitive` is `jsrt_to_primitive` in `runtime/src/jsrt_ops.c`. The frontend
gate accepts both operators — an earlier revision of this document said they were `STA1214`, which
described the Phase 2 fragment and stopped being true when rung 1a landed them.

---

## 7. `ToPrimitive` and the dynamic path

`ToPrimitive` is not conditional on the static type. Every runtime helper runs it on both operands
first and a primitive passes straight through, so the helper for a statically-`number` operand pays
a tag test and the helper for an `Unknown` one is correct — rather than the helpers splitting into a
static family that assumes primitives and a dynamic family that converts, which is two chances to
get §7's ordering right instead of one.

The spec's ordering:

**`ToPrimitive(value, hint)`**, for hint `number` (the default for arithmetic and relational
operators):
1. If `value` is already a primitive, return it.
2. Call `value.valueOf()`. If the result is a primitive, return it.
3. Call `value.toString()`. If the result is a primitive, return it.
4. Throw a `TypeError`.

For hint `string` (used by `String()` and by `+` when the other operand is known to be a string),
steps 2 and 3 swap: `toString` first, then `valueOf`.

The order is observable — an object with both methods reveals which one ran — so it is not an
implementation detail. `Symbol.toPrimitive` takes precedence over both when present; `Symbol` is
`STA1212`, Phase 5, so that branch is unreachable until then and must be written as an explicit
"not yet" rather than silently skipped.

`+`: `ToPrimitive` both with hint `number`, then **if either result is a string, concatenate;
otherwise `ToNumber` both and add.** The string check happens after `ToPrimitive` and before
`ToNumber` — an order that is easy to get backwards and produces `"1" + 1 === 2` when you do, or
`[1] + [2] === 3` where the language says `"12"`. Abstract Relational Comparison (`<`, `>`, `<=`,
`>=`) has the same shape and the same trap: `ToPrimitive` both, and only then ask whether both are
strings, which is what makes `["10"] < ["9"]` true and `["10"] < 9` false.

**The hint is unobservable in the subset as it stands, and `jsrt_to_primitive` therefore takes no
hint parameter.** The hint chooses only whether `valueOf` or `toString` is tried first, and step 2
never succeeds here: no object in the subset carries a user-written `valueOf`, and the inherited
`Object.prototype.valueOf` returns the object, which is not a primitive. So every object reaches
step 3 under either hint. User `valueOf`/`toString` methods are what make the two hints differ —
the parameter goes in when they land, not before, and `Symbol.toPrimitive` (`STA1212`, Phase 5)
gets its explicit "not yet" branch at the same time.

---

## 8. Number → string

Specified in full in `docs/VALUE.md` §3 and implemented in `runtime/src/jsrt_print.c`. The two
points that belong here because they are *numeric* decisions:

- The decimal/exponential threshold is **1e21**, far above any C library's default. `1e20` prints as
  twenty-one digits; `1e21` prints as `1e+21`. `printf("%g")` cannot express this and must not be
  used.
- `console.log(-0)` prints `-0`; `String(-0)` is `"0"`. Two functions, not one — `jsrt_print` and
  `jsrt_to_string`.

An `i32` and the `f64` with the same value must print identically. Since §1 says the split is
invisible, that is a requirement, not an observation: route both through the same formatter rather
than adding an integer fast path that prints separately.

---

## 9. What passes may and may not do

This section is the enforcement arm of §1. Const-fold, DCE, and inlining all run over numeric code,
and each has an obvious-looking transform that is wrong.

**A pass MAY:**
- fold arithmetic on two literal `number`s, *if* it computes the result with the same semantics this
  document specifies — including producing `-0`, `NaN`, and `Infinity` where they arise. Folding
  `0 * -1` to `0` instead of `-0` is a miscompile.
- change a value's representation between `i32` and `f64`, subject to §2.1.
- eliminate arithmetic whose result is provably unused, *if* it cannot throw. Numeric arithmetic
  never throws, so this is safe for `number` operands and **not** safe for `Unknown` ones, where the
  operation may invoke `valueOf` (§7) and thereby run arbitrary user code.

**A pass MAY NOT:**
- treat `x + 0` as `x`. If `x` is `-0`, `x + 0` is `+0`.
- treat `x * 1` as `x`, `x - 0` as `x`, or `x / 1` as `x` for the same reason.
- rewrite `!(a < b)` as `a >= b`, or any other De Morgan-style comparison flip, because `NaN` makes
  all four relational operators false at once (§6.1).
- assume an `i32` operand stays `i32` across an operation that can overflow (§2.3).
- elide a boundary check on an `Unknown`, ever, for any reason. `docs/HIR.md` states this as a
  property of the type system: the check exists because the type is unknowable statically, so a pass
  that "proves" it redundant has proved something false.
- reassociate floating-point arithmetic. `(a + b) + c` is not `a + (b + c)` in IEEE-754. This also
  means the generated C must never be compiled with `-ffast-math`, and `src/cli/build.ts` must not
  grow that flag.

Each of these is verifiable: the HIR verifier runs after every transform in debug builds, and the
golden tests compare against Node byte-for-byte. A pass that breaks one of these rules shows up as a
golden diff, which is the point of having built that harness first.

---

## 10. Decision tests

These are the tests plan.md §6 Task 3.2 names, plus the ones this document's rules imply. Each
belongs in `tests/subset/` (verdict) or `tests/golden/` (value), and each must pass before the
arithmetic rung is called done.

**Named in the plan:**

```js
(0xFFFFFFFF >>> 0) === 4294967295   // true  — §4.2, result is f64
Object.is(-0, 0) === false          // false — §5.1
(1 / 3 | 0) === 0                   // true  — §4.1, ToInt32 truncates toward zero
NaN !== NaN                         // true  — §5.2
```

**Implied by this document:**

```js
1 / 0 === Infinity                  // §3.1  — / is never integer division
1 / 2 === 0.5                       // §3.1  — the silent version of the same bug
5 % 0                               // NaN   — §3.2
2147483647 + 1 === 2147483648       // §2.3  — no wraparound
-(0) is -0                          // §3.3  — Object.is(-0, -(0)) === true
1 / -0 === -Infinity                // §5.1  — the -0 demotion canary
2147483648 | 0 === -2147483648      // §4.1  — modular, not saturating
1e21 | 0 === -559939584             // §4.1  — the case a C cast gets wrong (or UB). NEGATIVE.
1e10 | 0 === 1410065408             // §4.1
4294967296 | 0 === 0                // §4.1  — exactly 2^32
NaN | 0 === 0                       // §4.1
Infinity | 0 === 0                  // §4.1
(1 << 32) === 1                     // §4.3  — shift count masked to 5 bits
(-1 >>> 0) === 4294967295           // §4.2
Object.is(NaN, NaN) === true        // §5.2  — SameValue, opposite of ===
null == undefined                   // true  — §6.3
null == 0                           // false — §6.3, the surprising one
'' == 0                             // true  — §6.3
'0x10' == 16                        // true  — §6.3, ToNumber uses the spec grammar
NaN <= NaN                          // false — §6.1
(0.1 + 0.2) !== 0.3                 // §9    — no reassociation, no -ffast-math
0 * -1                              // -0    — §9, the const-fold canary
```

The last one deserves a note: it is the cheapest possible test for the most likely const-fold bug,
and it costs one line.

---

## 11. Phase scope

| Rule | Lands |
|---|---|
| §1–§3 arithmetic, `i32`/`f64` split | Phase 3 rung 1 |
| §4 bitwise, `ToInt32`/`ToUint32` | Phase 3 rung 1 |
| §5 `-0`/`NaN`/`Object.is` | Phase 3 rung 1 (the predicates); `Math.sign` with Phase 4 builtins |
| §6.1–§6.2 relational, `===` | Phase 3 rung 1 |
| §6.3 loose equality for primitives | Phase 3 rung 1 (lifts `STA1214` for `==`/`!=`) |
| §6.3.1 loose equality with objects | **shipped** (Phase 3 rung 6b) |
| §7 `ToPrimitive` | **shipped** (Phase 3 rung 6b), hintless while `valueOf` is unreachable; the hint parameter lands with user `valueOf`/`toString` |
| §7 `Symbol.toPrimitive` | Phase 5 (`STA1212`) |
| §8 number → string | **shipped** (Phase 2) |
| §9 pass rules | enforced from the first pass that exists |

Phase 2 shipped with every number an `f64` and no `i32` anywhere — deliberately, so that the
walking skeleton could be correct before it was fast. Introducing `i32` is therefore a change that
can only *break* things: there is no correctness argument for it, only a performance one. Land it
with §10's tests already passing on the `f64`-only path, so that any test that flips is
unambiguously the refinement's fault.
