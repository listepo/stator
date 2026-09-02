/* jsrt_value.c — value representation, frame management, and GC initialization. */

#include "jsrt_value.h"

#include "jsrt.h"

#include <assert.h>
#include <math.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ============================================================================
 * Boehm GC — optional conditional inclusion
 * ============================================================================ */

/* ============================================================================
 * Shadow stack frame management — rooting protocol for the GC
 * ============================================================================ */

_Thread_local JSRTFrame *jsrt_frame_top = NULL;

void jsrt_frame_init(JSRTFrame *frame) {
  /* Fill every slot with JSRT_UNDEFINED before the frame becomes reachable.
   * The frame is pushed AFTER this returns (in the JSRT_FRAME macro), so
   * a collection triggered mid-prologue can never scan an uninitialized slot. */
  for (uint32_t i = 0; i < frame->count; i++) {
    frame->slots[i] = JSRT_UNDEFINED;
  }
}

/* ============================================================================
 * Strict equality — NaN !== NaN, +0 === -0, number cross-representation
 * ============================================================================ */

bool jsrt_strict_equals(jsrt_value a, jsrt_value b) {
  /* Numbers compare by VALUE, not by bits, and in both directions: two representations of the
   * same number are equal even when their bits differ (+0 vs -0, and i32 5 vs double 5.0), while
   * NaN is unequal to itself even when the bits are identical. Normalizing both sides to a double
   * first is what makes all four of those cases fall out of one comparison. */
  if (jsrt_is_number(a) && jsrt_is_number(b)) {
    double da = jsrt_number_value(a);
    double db = jsrt_number_value(b);
    return da == db; /* C's == already gives false for NaN and true for +0 vs -0 */
  }

  /* Strings compare by content, not by pointer. Two identical string values at different
   * addresses must be equal. */
  if (jsrt_is(a, JSRT_TAG_STRING) && jsrt_is(b, JSRT_TAG_STRING)) {
    return jsrt_string_equals(a, b);
  }

  /* Everything else is bit equality. */
  return a == b;
}

/* ============================================================================
 * Initialization — assert 48-bit pointer assumption and set up GC
 * ============================================================================ */

void jsrt_init(void) {
  /* Verify the 48-bit pointer assumption against a real heap allocation.
   * This check must fail loudly at startup, never silently. */
  void *test_ptr = malloc(1024);
  if (test_ptr == NULL) {
    fprintf(stderr,
            "jsrt_init: malloc failed during pointer-width check\n");
    abort();
  }

  uintptr_t ptr_val = (uintptr_t)test_ptr;
  if ((ptr_val >> 48) != 0) {
    fprintf(stderr,
            "jsrt_init: FATAL — 48-bit pointer assumption violated.\n"
            "  Heap pointer %p has bits set above bit 48.\n"
            "  This platform (likely with 5-level paging or AArch64 TBI) "
            "is out of scope for Stator v0.\n",
            test_ptr);
    free(test_ptr);
    abort();
  }

  free(test_ptr);

  jsrt_gc_init();
}

/* ----------------------------------------------------------------- calls */

jsrt_value jsrt_call_at(jsrt_value callee, uint32_t argc, const jsrt_value *argv, const char *loc) {
  if (!jsrt_is(callee, JSRT_TAG_CLOSURE)) {
    if (loc != NULL) {
      char msg[512];
      (void)snprintf(msg, sizeof msg, "STA2006: calling a non-function at %s", loc);
      jsrt_panic(msg);
    }
    jsrt_panic("TypeError: callee is not a function");
  }
  const JSRTClosure *c = jsrt_as_closure(callee);
  /* `env` is NULL for a non-capturing function; the callee takes the parameter either way, so
   * dispatch here does not have to know which kind it is holding. */
  return c->fn(argc, argv, c->env);
}

jsrt_value jsrt_call(jsrt_value callee, uint32_t argc, const jsrt_value *argv) {
  return jsrt_call_at(callee, argc, argv, NULL);
}

/* -------------------------------------------------------------- objects */

jsrt_value jsrt_object_new(const JSRTClass *cls) {
  /* One allocation, header and slots together: the flexible member is safe because an object's
   * slot count never changes (see the comment on JSRTObject). */
  const size_t bytes = sizeof(JSRTObject) + (size_t)cls->field_count * sizeof(jsrt_value);
  JSRTObject *object = (JSRTObject *)jsrt_gc_alloc(bytes, "object");
  object->cls = cls;
  /* Every slot starts `undefined` -- both because that is what an unassigned field reads as, and
   * because a conservative collector scans these words before the constructor has written them. */
  for (uint32_t i = 0; i < cls->field_count; i++) {
    object->fields[i] = JSRT_UNDEFINED;
  }
  return JSRT_BOX(JSRT_TAG_OBJECT, (uintptr_t)object);
}

/* --------------------------------------------------------------- arrays */

/* Allocation for the element buffer. Split out because the array grows: `elements` is reallocated
 * where the header is not, and both halves must come from the same allocator as everything else so
 * the collector traces the values inside. */
static jsrt_value *alloc_elements(uint32_t capacity) {
  size_t bytes = (size_t)capacity * sizeof(jsrt_value);
  jsrt_value *elements = (jsrt_value *)jsrt_gc_alloc(bytes, "array elements");
  return elements;
}

jsrt_value jsrt_array_new(uint32_t count, const jsrt_value *items) {
  JSRTArray *array = (JSRTArray *)jsrt_gc_alloc(sizeof(JSRTArray), "array");
  /* An empty literal still gets a one-element buffer, so `elements` is never NULL and every path
   * below can index it without a null test. */
  uint32_t capacity = count > 0 ? count : 1;
  array->elements = alloc_elements(capacity);
  array->capacity = capacity;
  array->length = count;
  /* No named-property table until something hangs a property off this array (a RegExp match is the
   * only thing that does today), which is what NULL means to jsrt_shape.c. */
  array->shape = NULL;
  array->slots = NULL;
  array->slot_capacity = 0;
  for (uint32_t i = 0; i < count; i++) {
    array->elements[i] = items[i];
  }
  /* Beyond `length` the buffer is scanned by a conservative collector, so it must not hold stale
   * bits that happen to look like pointers. */
  for (uint32_t i = count; i < capacity; i++) {
    array->elements[i] = JSRT_UNDEFINED;
  }
  return JSRT_BOX(JSRT_TAG_ARRAY, (uintptr_t)array);
}

jsrt_value jsrt_array_length(jsrt_value array) {
  return jsrt_number((double)jsrt_as_array(array)->length);
}

/* An index is in range only when it is a non-negative integer below `length`. Everything else --
 * a fraction, a negative, NaN, a number past the end -- is a property name that this array does
 * not have, which reads as `undefined`. Returning the index through a bool keeps that single
 * definition of "in range" shared between the read and the write path. */
static bool index_of(jsrt_value index, uint32_t *out) {
  double d = jsrt_to_number(index);
  /* Check the upper bound BEFORE converting: a C floating-to-uint32 conversion outside the
   * representable range is undefined, while JavaScript simply treats that value as a named
   * (non-index) property. */
  if (!(d >= 0.0) || d >= 4294967296.0 || d != trunc(d)) {
    return false;
  }
  *out = (uint32_t)d;
  return true;
}

jsrt_value jsrt_array_get(jsrt_value array, jsrt_value index) {
  const JSRTArray *a = jsrt_as_array(array);
  uint32_t i = 0;
  if (!index_of(index, &i) || i >= a->length) {
    return JSRT_UNDEFINED;
  }
  return a->elements[i];
}

void jsrt_array_set(jsrt_value array, jsrt_value index, jsrt_value element) {
  JSRTArray *a = jsrt_as_array(array);
  uint32_t i = 0;
  if (!index_of(index, &i)) {
    /* A non-index key is a named property. The subset has no property table, so the store is
     * dropped rather than silently corrupting element storage. */
    return;
  }

  if (i > a->length) {
    /* A write more than one past the end leaves the skipped indices genuinely ABSENT in ECMA-262 --
     * `console.log` prints `<2 empty items>`, not `undefined` -- and a dense array has no way to be
     * absent. Filling with `undefined` would print a different program's output, so this refuses
     * loudly instead (STA2002). In-range writes and the append idiom `a[a.length] = v` are the
     * cases that matter and are unaffected; the refusal lifts when sparse arrays land. */
    jsrt_panic("STA2002: sparse arrays are not yet supported: write past the end of an array");
  }

  if (i >= a->capacity) {
    /* Double until it fits, so repeated appends stay amortized O(1) rather than O(n) per push.
     * Widened to 64 bits because doubling a capacity near UINT32_MAX would wrap to zero and spin
     * here forever; an index that high is a request the allocator will refuse anyway. */
    uint64_t capacity = a->capacity;
    while (capacity <= (uint64_t)i) {
      capacity *= 2;
    }
    if (capacity > UINT32_MAX) {
      jsrt_panic("array index too large");
    }
    jsrt_value *grown = alloc_elements((uint32_t)capacity);
    for (uint32_t k = 0; k < a->length; k++) {
      grown[k] = a->elements[k];
    }
    for (uint32_t k = a->length; k < (uint32_t)capacity; k++) {
      grown[k] = JSRT_UNDEFINED;
    }
    a->elements = grown;
    a->capacity = (uint32_t)capacity;
  }

  /* At this point `i <= a->length`, so the write either replaces an element or appends exactly
   * one -- no gap is possible, which is what the refusal above buys. */
  a->elements[i] = element;
  if (i >= a->length) {
    a->length = i + 1;
  }
}

/* ---------------------------------------------------------- environments */

JSRTEnv *jsrt_env_new(JSRTEnv *parent, uint32_t count) {
  size_t alloc_size = sizeof(JSRTEnv) + (size_t)count * sizeof(jsrt_value);
  JSRTEnv *env = (JSRTEnv *)jsrt_gc_alloc(alloc_size, "closure environment");

  env->parent = parent;
  env->count = count;
  /* Initialized before the env is reachable from any root, so a collection can never scan a slot
   * holding whatever the allocator left behind -- the discipline JSRT_FRAME follows for slots. */
  for (uint32_t i = 0; i < count; i++) {
    env->slots[i] = JSRT_UNDEFINED;
  }
  return env;
}

jsrt_value jsrt_closure_new(jsrt_value (*fn)(uint32_t argc, const jsrt_value *argv, JSRTEnv *env),
                            uint32_t arity, const char *name, JSRTEnv *env) {
  JSRTClosure *c = (JSRTClosure *)jsrt_gc_alloc(sizeof(JSRTClosure), "closure");

  c->fn = fn;
  c->arity = arity;
  c->name = name;
  c->env = env;
  return jsrt_closure(c);
}
