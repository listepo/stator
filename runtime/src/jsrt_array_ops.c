/* Array.prototype builtins (plan.md §7 Task 4.2) — the non-callback surface, ECMA-262 §23.1.3.
 *
 * Everything here is EXACT over the dense representation: index arithmetic, strict-equality
 * search (`includes` uses SameValueZero, which finds NaN where `indexOf` cannot), and in-place
 * mutation returning the receiver. The methods that take a FUNCTION call back into compiled code
 * through `jsrt_call` — the same closure ABI compiled callers dispatch through, so the runtime
 * needs no protocol of its own. Each caches `length` at entry (the spec's ToLength step): an
 * element the callback appends is not visited, one it mutates is seen as current.
 *
 * Optional arguments arrive as JSRT_UNDEFINED — the lowering pads missing ones, and for every
 * method HERE the spec gives explicit `undefined` the meaning of an absent argument. The one
 * method where that is false, `lastIndexOf` (absent `fromIndex` means `length - 1`, explicit
 * `undefined` means `0`), lands without its position argument for exactly that reason. */

#include <string.h>

#include "jsrt.h"
#include "jsrt_index_util.h"
#include "jsrt_value.h"

static JSRTArray *arr(jsrt_value v) { return jsrt_as_array(v); }

/* Append one element through the public write path, which owns growth and the sparse-write
 * refusal; `length` is the one index a write may extend through. */
static void append(jsrt_value array, jsrt_value element) {
  jsrt_array_set(array, jsrt_number((double)arr(array)->length), element);
}

jsrt_value jsrt_array_push(jsrt_value array, jsrt_value element) {
  append(array, element);
  return jsrt_array_length(array);
}

jsrt_value jsrt_array_pop(jsrt_value array) {
  JSRTArray *a = arr(array);
  if (a->length == 0) {
    return JSRT_UNDEFINED;
  }
  jsrt_value out = a->elements[a->length - 1];
  /* Clear the vacated slot: a conservative collector keeps scanning up to `capacity`, and a stale
   * value here would pin a dead object. */
  a->elements[a->length - 1] = JSRT_UNDEFINED;
  a->length -= 1;
  return out;
}

jsrt_value jsrt_array_shift(jsrt_value array) {
  JSRTArray *a = arr(array);
  if (a->length == 0) {
    return JSRT_UNDEFINED;
  }
  jsrt_value out = a->elements[0];
  memmove(a->elements, a->elements + 1, (size_t)(a->length - 1) * sizeof(jsrt_value));
  a->elements[a->length - 1] = JSRT_UNDEFINED;
  a->length -= 1;
  return out;
}

jsrt_value jsrt_array_unshift(jsrt_value array, jsrt_value element) {
  /* Grow by appending (the public path owns capacity), then rotate the new slot to the front. */
  append(array, element);
  JSRTArray *a = arr(array);
  memmove(a->elements + 1, a->elements, (size_t)(a->length - 1) * sizeof(jsrt_value));
  a->elements[0] = element;
  return jsrt_array_length(array);
}

jsrt_value jsrt_array_at(jsrt_value array, jsrt_value index) {
  const JSRTArray *a = arr(array);
  double k = jsrt_int_or_inf(index, 0.0);
  if (k < 0.0) {
    k += (double)a->length;
  }
  if (k < 0.0 || k >= (double)a->length) {
    return JSRT_UNDEFINED;
  }
  return a->elements[(uint32_t)k];
}

/* SameValueZero: strict equality plus NaN finding NaN (§7.2.9). `includes` searches with it;
 * `indexOf` keeps strict equality and therefore never finds NaN — the spec's own asymmetry. */
static bool same_value_zero(jsrt_value a, jsrt_value b) {
  if (jsrt_strict_equals(a, b)) {
    return true;
  }
  return jsrt_is_double(a) && jsrt_is_double(b) && isnan(jsrt_to_double(a)) &&
         isnan(jsrt_to_double(b));
}

/* The shared fromIndex step of indexOf/includes (§23.1.3.14 steps 4–8): clamp a relative start
 * into [0, len], where len itself means "search nothing". */
static uint32_t search_start(jsrt_value from, uint32_t len) {
  return jsrt_relative_index(jsrt_int_or_inf(from, 0.0), len);
}

jsrt_value jsrt_array_index_of(jsrt_value array, jsrt_value search, jsrt_value from) {
  const JSRTArray *a = arr(array);
  for (uint32_t i = search_start(from, a->length); i < a->length; i++) {
    if (jsrt_strict_equals(a->elements[i], search)) {
      return jsrt_number((double)i);
    }
  }
  return jsrt_number(-1.0);
}

jsrt_value jsrt_array_last_index_of(jsrt_value array, jsrt_value search) {
  const JSRTArray *a = arr(array);
  for (uint32_t i = a->length; i > 0; i--) {
    if (jsrt_strict_equals(a->elements[i - 1], search)) {
      return jsrt_number((double)(i - 1));
    }
  }
  return jsrt_number(-1.0);
}

jsrt_value jsrt_array_includes(jsrt_value array, jsrt_value search, jsrt_value from) {
  const JSRTArray *a = arr(array);
  for (uint32_t i = search_start(from, a->length); i < a->length; i++) {
    if (same_value_zero(a->elements[i], search)) {
      return JSRT_TRUE;
    }
  }
  return JSRT_FALSE;
}

jsrt_value jsrt_array_slice(jsrt_value array, jsrt_value start, jsrt_value end) {
  const JSRTArray *a = arr(array);
  uint32_t from = jsrt_relative_index(jsrt_int_or_inf(start, 0.0), a->length);
  uint32_t to = jsrt_relative_index(jsrt_int_or_inf(end, (double)a->length), a->length);
  uint32_t count = to > from ? to - from : 0;
  return jsrt_array_new(count, count > 0 ? a->elements + from : NULL);
}

/* One array argument, spread — `[1].concat([2, 3])` is `[1, 2, 3]` (§23.1.3.1; the gate admits
 * exactly this shape). Neither receiver is mutated. */
jsrt_value jsrt_array_concat(jsrt_value array, jsrt_value other) {
  const JSRTArray *a = arr(array);
  jsrt_value out = jsrt_array_new(a->length, a->length > 0 ? a->elements : NULL);
  const JSRTArray *b = arr(other);
  for (uint32_t i = 0; i < b->length; i++) {
    append(out, b->elements[i]);
  }
  return out;
}

jsrt_value jsrt_array_reverse(jsrt_value array) {
  JSRTArray *a = arr(array);
  for (uint32_t i = 0, j = a->length; i + 1 < j; i++, j--) {
    jsrt_value tmp = a->elements[i];
    a->elements[i] = a->elements[j - 1];
    a->elements[j - 1] = tmp;
  }
  return array;
}

jsrt_value jsrt_array_fill(jsrt_value array, jsrt_value value, jsrt_value start, jsrt_value end) {
  JSRTArray *a = arr(array);
  uint32_t from = jsrt_relative_index(jsrt_int_or_inf(start, 0.0), a->length);
  uint32_t to = jsrt_relative_index(jsrt_int_or_inf(end, (double)a->length), a->length);
  for (uint32_t i = from; i < to; i++) {
    a->elements[i] = value;
  }
  return array;
}

jsrt_value jsrt_array_copy_within(jsrt_value array, jsrt_value target, jsrt_value start,
                                  jsrt_value end) {
  JSRTArray *a = arr(array);
  const uint32_t to = jsrt_relative_index(jsrt_int_or_inf(target, 0.0), a->length);
  const uint32_t from = jsrt_relative_index(jsrt_int_or_inf(start, 0.0), a->length);
  const uint32_t last = jsrt_relative_index(jsrt_int_or_inf(end, (double)a->length), a->length);
  const uint32_t span = last > from ? last - from : 0;
  const uint32_t room = a->length - to;
  const uint32_t count = span < room ? span : room;
  memmove(a->elements + to, a->elements + from, (size_t)count * sizeof(jsrt_value));
  return array;
}

/* The two-argument form only: `splice(start)` deletes to the END while an explicit undefined
 * deleteCount deletes NOTHING, so the two cannot share a padded signature (the lastIndexOf rule),
 * and the insertion form is variadic. Returns the removed run. */
jsrt_value jsrt_array_splice(jsrt_value array, jsrt_value start, jsrt_value delete_count) {
  JSRTArray *a = arr(array);
  const uint32_t from = jsrt_relative_index(jsrt_int_or_inf(start, 0.0), a->length);
  const double want = jsrt_int_or_inf(delete_count, 0.0);
  const uint32_t room = a->length - from;
  const uint32_t count = want <= 0.0 ? 0 : (want >= (double)room ? room : (uint32_t)want);
  jsrt_value removed = jsrt_array_new(count, count > 0 ? a->elements + from : NULL);
  memmove(a->elements + from, a->elements + from + count,
          (size_t)(a->length - from - count) * sizeof(jsrt_value));
  for (uint32_t i = a->length - count; i < a->length; i++) {
    a->elements[i] = JSRT_UNDEFINED; /* conservative scan runs to capacity */
  }
  a->length -= count;
  return removed;
}

/* Depth-limited recursive flatten; `depth` already went through ToIntegerOrInfinity, so a plain
 * double comparison carries Infinity for free. */
static void flatten_into(jsrt_value out, jsrt_value v, double depth) {
  JSRTArray *a = arr(v);
  const uint32_t len = a->length;
  for (uint32_t i = 0; i < len && i < arr(v)->length; i++) {
    jsrt_value elem = arr(v)->elements[i];
    if (depth >= 1.0 && jsrt_is(elem, JSRT_TAG_ARRAY)) {
      flatten_into(out, elem, depth - 1.0);
    } else {
      append(out, elem);
    }
  }
}

jsrt_value jsrt_array_flat(jsrt_value array, jsrt_value depth) {
  jsrt_value out = jsrt_array_new(0, NULL);
  flatten_into(out, array, jsrt_int_or_inf(depth, 1.0));
  return out;
}

/* ---------------------------------------------------------------- callback methods */

/* One callback invocation, the spec's argument triple: (element, index, the array itself). A
 * compiled callee declared with fewer parameters reads the missing ones as `undefined` through
 * jsrt_arg, so passing all three is always right. */
static jsrt_value call_cb(jsrt_value cb, jsrt_value array, uint32_t i) {
  jsrt_value args[3] = {arr(array)->elements[i], jsrt_number((double)i), array};
  return jsrt_call(cb, 3, args);
}

/* The guard every upward callback walk shares: still inside the length read at ENTRY, still inside
 * the array a callback may since have shortened, and no exception pending. The last conjunct is
 * not an optimization -- a callback that threw has unwound, and calling it again would run user
 * code after the throw and overwrite the pending value with the next call's. Generated C checks
 * `jsrt_pending()` the moment one of these returns, so a partial answer is never observed. */
static bool walking(jsrt_value array, uint32_t i, uint32_t len) {
  return i < len && i < arr(array)->length && !jsrt_pending();
}

jsrt_value jsrt_array_for_each(jsrt_value array, jsrt_value cb) {
  const uint32_t len = arr(array)->length;
  for (uint32_t i = 0; walking(array, i, len); i++) {
    call_cb(cb, array, i);
  }
  return JSRT_UNDEFINED;
}

jsrt_value jsrt_array_map(jsrt_value array, jsrt_value cb) {
  const uint32_t len = arr(array)->length;
  jsrt_value out = jsrt_array_new(0, NULL);
  for (uint32_t i = 0; walking(array, i, len); i++) {
    append(out, call_cb(cb, array, i));
  }
  return out;
}

jsrt_value jsrt_array_filter(jsrt_value array, jsrt_value cb) {
  const uint32_t len = arr(array)->length;
  jsrt_value out = jsrt_array_new(0, NULL);
  for (uint32_t i = 0; walking(array, i, len); i++) {
    /* Capture kValue before the callback. The callback receives this snapshot, and the selected
     * value pushed into the result is that same snapshot even when the callback mutates the
     * receiver's slot (ECMA-262 §23.1.3.8 steps 6.a–6.c). */
    const jsrt_value element = arr(array)->elements[i];
    if (jsrt_truthy(call_cb(cb, array, i))) {
      append(out, element);
    }
  }
  return out;
}

jsrt_value jsrt_array_some(jsrt_value array, jsrt_value cb) {
  const uint32_t len = arr(array)->length;
  for (uint32_t i = 0; walking(array, i, len); i++) {
    if (jsrt_truthy(call_cb(cb, array, i))) {
      return JSRT_TRUE;
    }
  }
  return JSRT_FALSE;
}

jsrt_value jsrt_array_every(jsrt_value array, jsrt_value cb) {
  const uint32_t len = arr(array)->length;
  for (uint32_t i = 0; walking(array, i, len); i++) {
    if (!jsrt_truthy(call_cb(cb, array, i))) {
      return JSRT_FALSE;
    }
  }
  return JSRT_TRUE;
}

jsrt_value jsrt_array_find(jsrt_value array, jsrt_value cb) {
  const uint32_t len = arr(array)->length;
  for (uint32_t i = 0; walking(array, i, len); i++) {
    jsrt_value elem = arr(array)->elements[i];
    if (jsrt_truthy(call_cb(cb, array, i))) {
      return elem;
    }
  }
  return JSRT_UNDEFINED;
}

/* map, then a depth-1 flatten of each answer -- one pass, no intermediate array. */
jsrt_value jsrt_array_flat_map(jsrt_value array, jsrt_value cb) {
  const uint32_t len = arr(array)->length;
  jsrt_value out = jsrt_array_new(0, NULL);
  for (uint32_t i = 0; walking(array, i, len); i++) {
    jsrt_value mapped = call_cb(cb, array, i);
    if (jsrt_is(mapped, JSRT_TAG_ARRAY)) {
      flatten_into(out, mapped, 0.0);
    } else {
      append(out, mapped);
    }
  }
  return out;
}

jsrt_value jsrt_array_find_index(jsrt_value array, jsrt_value cb) {
  const uint32_t len = arr(array)->length;
  for (uint32_t i = 0; walking(array, i, len); i++) {
    if (jsrt_truthy(call_cb(cb, array, i))) {
      return jsrt_number((double)i);
    }
  }
  return jsrt_number(-1.0);
}

/* reduce/reduceRight, WITH-initial form only: the zero-initial form gives the first element a
 * different role (it becomes the seed and the loop starts at 1), and an EXPLICIT `undefined`
 * initial is an initial — so the two forms cannot share an undefined-padded signature. The
 * callback triple grows the accumulator in front: (acc, element, index, array). */
jsrt_value jsrt_array_reduce(jsrt_value array, jsrt_value cb, jsrt_value initial) {
  const uint32_t len = arr(array)->length;
  jsrt_value acc = initial;
  for (uint32_t i = 0; walking(array, i, len); i++) {
    jsrt_value args[4] = {acc, arr(array)->elements[i], jsrt_number((double)i), array};
    acc = jsrt_call(cb, 4, args);
  }
  return acc;
}

jsrt_value jsrt_array_reduce_right(jsrt_value array, jsrt_value cb, jsrt_value initial) {
  const uint32_t len = arr(array)->length;
  jsrt_value acc = initial;
  for (uint32_t i = len; i-- > 0 && !jsrt_pending();) {
    /* Downward over the ENTRY length, skipping indices the array no longer has: existence is
     * checked at visit time, exactly the spec's HasProperty step. */
    if (i >= arr(array)->length) {
      continue;
    }
    jsrt_value args[4] = {acc, arr(array)->elements[i], jsrt_number((double)i), array};
    acc = jsrt_call(cb, 4, args);
  }
  return acc;
}

/* Array.prototype.sort, ECMA-262 §23.1.3.30. Stability is normative, so this is a merge sort,
 * not qsort. The scratch is a real jsrt array rather than raw malloc: during a merge an element's
 * ONLY reference is the scratch copy, and a collector must be able to see it there.
 *
 * SortCompare's undefined rule runs BEFORE the comparator: undefined elements sink to the end
 * without the comparator ever seeing one. The comparator's answer coerces NaN to 0, and the
 * DEFAULT comparator is ToString + code-unit comparison -- [10, 9] stays [10, 9]. */
static int sort_compare(jsrt_value x, jsrt_value y, jsrt_value cmp) {
  const bool xu = jsrt_is(x, JSRT_TAG_UNDEFINED);
  const bool yu = jsrt_is(y, JSRT_TAG_UNDEFINED);
  if (xu || yu) {
    return xu ? (yu ? 0 : 1) : -1;
  }
  if (!jsrt_is(cmp, JSRT_TAG_UNDEFINED)) {
    jsrt_value args[2] = {x, y};
    const double d = jsrt_to_number(jsrt_call(cmp, 2, args));
    return (d < 0) ? -1 : (d > 0) ? 1 : 0;
  }
  return jsrt_string_compare(jsrt_to_string(x), jsrt_to_string(y));
}

/* Bottom-up stable merge over [lo, mid) x [mid, hi), scratch mirrors the receiver's storage. */
static void sort_merge(jsrt_value *elems, jsrt_value *scratch, uint32_t lo, uint32_t mid,
                       uint32_t hi, jsrt_value cmp) {
  uint32_t a = lo;
  uint32_t b = mid;
  for (uint32_t k = lo; k < hi && !jsrt_pending(); k++) {
    /* `<= 0` keeps the left run's element on ties: that inequality IS the stability. */
    const bool take_a = a < mid && (b >= hi || sort_compare(elems[a], elems[b], cmp) <= 0);
    scratch[k] = take_a ? elems[a++] : elems[b++];
  }
  if (jsrt_pending()) {
    return; /* the merge is incomplete, so writing it back would duplicate elements */
  }
  memcpy(elems + lo, scratch + lo, (size_t)(hi - lo) * sizeof(jsrt_value));
}

static void sort_range(jsrt_value *elems, jsrt_value *scratch, uint32_t lo, uint32_t hi,
                       jsrt_value cmp) {
  /* A comparator that threw stops the sort where it stands: the receiver is left partially
   * ordered, which nothing may observe -- the caller jumps to its landing pad instead. */
  if (hi - lo < 2 || jsrt_pending()) {
    return;
  }
  const uint32_t mid = lo + (hi - lo) / 2;
  sort_range(elems, scratch, lo, mid, cmp);
  sort_range(elems, scratch, mid, hi, cmp);
  sort_merge(elems, scratch, lo, mid, hi, cmp);
}

jsrt_value jsrt_array_sort(jsrt_value array, jsrt_value cmp) {
  JSRTArray *a = arr(array);
  if (a->length >= 2) {
    jsrt_value scratch_owner = jsrt_array_new(a->length, a->elements);
    sort_range(a->elements, arr(scratch_owner)->elements, 0, a->length, cmp);
  }
  return array;
}

/* The downward mirrors of find/findIndex, same entry-length + existence discipline. */
jsrt_value jsrt_array_find_last(jsrt_value array, jsrt_value cb) {
  const uint32_t len = arr(array)->length;
  for (uint32_t i = len; i-- > 0 && !jsrt_pending();) {
    if (i >= arr(array)->length) {
      continue;
    }
    jsrt_value elem = arr(array)->elements[i];
    if (jsrt_truthy(call_cb(cb, array, i))) {
      return elem;
    }
  }
  return JSRT_UNDEFINED;
}

jsrt_value jsrt_array_find_last_index(jsrt_value array, jsrt_value cb) {
  const uint32_t len = arr(array)->length;
  for (uint32_t i = len; i-- > 0 && !jsrt_pending();) {
    if (i >= arr(array)->length) {
      continue;
    }
    if (jsrt_truthy(call_cb(cb, array, i))) {
      return jsrt_number((double)i);
    }
  }
  return jsrt_number(-1.0);
}

/* The ES2023 immutable variants: a fresh copy, then the mutating op's own machinery. */
jsrt_value jsrt_array_to_reversed(jsrt_value array) {
  JSRTArray *a = arr(array);
  jsrt_value out = jsrt_array_new(a->length, a->length > 0 ? a->elements : NULL);
  return jsrt_array_reverse(out);
}

jsrt_value jsrt_array_to_sorted(jsrt_value array, jsrt_value cmp) {
  JSRTArray *a = arr(array);
  jsrt_value out = jsrt_array_new(a->length, a->length > 0 ? a->elements : NULL);
  return jsrt_array_sort(out, cmp);
}

/* Two-argument form, same rule as splice: skipCount's padding trap is inherited. */
jsrt_value jsrt_array_to_spliced(jsrt_value array, jsrt_value start, jsrt_value skip_count) {
  JSRTArray *a = arr(array);
  jsrt_value out = jsrt_array_new(a->length, a->length > 0 ? a->elements : NULL);
  jsrt_array_splice(out, start, skip_count);
  return out;
}

/* ToString on an array IS join with the default separator (§23.1.3.36 via §23.1.3.18). */
jsrt_value jsrt_array_to_string(jsrt_value array) {
  return jsrt_array_join(array, JSRT_UNDEFINED);
}

/* `with(i, v)`: a copy with one element replaced. The spec throws RangeError for an index
 * outside the array; builtins cannot raise yet, so out-of-range aborts loudly (STA2005
 * pattern) rather than answering something the spec never returns. */
jsrt_value jsrt_array_with(jsrt_value array, jsrt_value index, jsrt_value value) {
  JSRTArray *a = arr(array);
  double rel = jsrt_int_or_inf(index, 0.0);
  if (rel < 0.0) {
    rel += (double)a->length;
  }
  if (rel < 0.0 || rel >= (double)a->length) {
    jsrt_panic(
        "Array.prototype.with index out of range is not yet supported; the spec throws "
        "RangeError, which builtins cannot raise yet");
  }
  jsrt_value out = jsrt_array_new(a->length, a->length > 0 ? a->elements : NULL);
  arr(out)->elements[(uint32_t)rel] = value;
  return out;
}
