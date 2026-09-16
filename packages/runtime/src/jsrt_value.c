/* jsrt_value.c — value representation, frame management, and GC initialization. */

#include "jsrt_value.h"

#include "jsrt.h"

#include "jsrt_mem.h"

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
  if (c->has_receiver) {
    /* A method's parameter zero is `this`. A direct call passes it (`o.m(a)` -> argc == arity + 1);
     * a method value does not (`g(a)` -> argc == arity), so slot zero is filled with `undefined`
     * and the user arguments keep their positions (docs/VALUE.md §4.16, plan-notes 208). */
    const uint32_t js_arity = c->arity;
    const uint32_t internal = js_arity + 1U;
    const bool with_receiver = argc == internal;
    jsrt_value shifted[internal > 0U ? internal : 1U];
    shifted[0] = with_receiver ? argv[0] : JSRT_UNDEFINED;
    for (uint32_t i = 0; i < js_arity; i++) {
      shifted[i + 1U] =
          jsrt_arg(with_receiver ? argc - 1U : argc, with_receiver ? argv + 1 : argv, i);
    }
    return c->fn(internal, shifted, c->env);
  }
  return c->fn(argc, argv, c->env);
}

jsrt_value jsrt_call(jsrt_value callee, uint32_t argc, const jsrt_value *argv) {
  return jsrt_call_at(callee, argc, argv, NULL);
}

/* The allocation helpers jsrt_value.h declares -- objects, arrays and their growth, environments,
 * closures, rest arrays -- are jsrt_alloc.zig. What stays here is what they are used for. */

/* --------------------------------------------------------------- arrays */

/* The STA2008 throw `jsrt_require_array` raises for a non-array receiver: Node's member-access
 * wording for a nullish receiver (`Cannot read properties of undefined (reading 'push')`, which
 * is where Node throws for the same program), `Array.prototype.<method> called on incompatible
 * receiver` otherwise -- Node's message names receiver SOURCE TEXT, which compiled code no longer
 * has, so only the nullish half can be Node-exact. The incompatible-receiver shape follows the
 * generator/iterator precedent in jsrt_iterator.c. */
static void throw_array_receiver(jsrt_value array, const char *method) {
  if (jsrt_is_nullish(array)) {
    char message[256];
    (void)snprintf(message, sizeof message, "Cannot read properties of %s (reading '%s')",
                    array == JSRT_NULL ? "null" : "undefined", method);
    jsrt_throw_error(&jsrt_class_type_error, message);
    return;
  }
  char message[256];
  (void)snprintf(message, sizeof message, "Array.prototype.%s called on incompatible receiver",
                 method);
  jsrt_throw_error(&jsrt_class_type_error, message);
}

JSRTArray *jsrt_require_array(jsrt_value array, const char *method) {
  if (jsrt_is(array, JSRT_TAG_ARRAY)) {
    return jsrt_as_array(array);
  }
  throw_array_receiver(array, method);
  return NULL;
}

/* Render the for-of receiver for STA2009's `X is not iterable`: the nullish words and
 * number/boolean ToString are Node-exact; a string renders as its content (a real string never
 * reaches here -- strings are iterable -- so this is an annotation lie, not a language path);
 * anything else is "object", which names no value but also invents none. */
static void iterable_name(jsrt_value value, char *buf, size_t buflen) {
  if (value == JSRT_NULL) {
    (void)snprintf(buf, buflen, "null");
    return;
  }
  if (value == JSRT_UNDEFINED) {
    (void)snprintf(buf, buflen, "undefined");
    return;
  }
  if (jsrt_is_number(value) || jsrt_is(value, JSRT_TAG_BOOL)) {
    const jsrt_value text = jsrt_to_string(value);
    const uint32_t len = jsrt_string_length(text);
    size_t i = 0;
    for (; i < len && i + 1 < buflen; i++) {
      buf[i] = (char)jsrt_string_char(text, i);
    }
    buf[i] = '\0';
    return;
  }
  if (jsrt_is(value, JSRT_TAG_STRING)) {
    const uint32_t len = jsrt_string_length(value);
    size_t i = 0;
    for (; i < len && i + 1 < buflen; i++) {
      buf[i] = (char)jsrt_string_char(value, i);
    }
    buf[i] = '\0';
    return;
  }
  (void)snprintf(buf, buflen, "object");
}

void jsrt_require_array_iterable(jsrt_value value) {
  if (jsrt_is(value, JSRT_TAG_ARRAY)) {
    return;
  }
  char name[128];
  iterable_name(value, name, sizeof name);
  char message[256];
  (void)snprintf(message, sizeof message, "%s is not iterable", name);
  jsrt_throw_error(&jsrt_class_type_error, message);
}

jsrt_value jsrt_array_length(jsrt_value array) {
  if (!jsrt_is(array, JSRT_TAG_ARRAY)) {
    /* Degrades like the index paths: nullish throws Node's `(reading 'length')`, a string
     * answers its length, anything else misses to `undefined`. */
    return jsrt_get_prop(array, "length", NULL);
  }
  return jsrt_number((double)jsrt_as_array(array)->length);
}

/* An index is in range only when its ToPropertyKey is a canonical numeric string (ECMA-262
 * §6.1.7) below `length`. Everything else -- a fraction, a negative, NaN, a number past the end,
 * a boolean, null, `"01"` -- is a property name that this array does not have, which reads as
 * `undefined`. A bare `jsrt_to_number` cannot tell them apart (`true` is 1, `"01"` is 1, `""` is
 * 0, all of which Node misses), so only numbers take the numeric test; every other key goes
 * through the same canonical spelling the shape table uses (plan.md §8 step 44b). Returning the
 * index through a bool keeps that single definition of "in range" shared between the read and
 * the write path. */
static bool index_of(jsrt_value index, uint32_t *out) {
  if (jsrt_is_number(index)) {
    const double d = jsrt_number_value(index);
    /* Check the upper bound BEFORE converting: a C floating-to-uint32 conversion outside the
     * representable range is undefined, while JavaScript simply treats that value as a named
     * (non-index) property. */
    if (!(d >= 0.0) || d >= 4294967296.0 || d != trunc(d)) {
      return false;
    }
    *out = (uint32_t)d;
    return true;
  }
  const char *key = jsrt_shape_key(jsrt_to_string(index));
  const bool ok = jsrt_key_is_array_index(key, out);
  free((void *)key);
  return ok;
}

jsrt_value jsrt_array_get(jsrt_value array, jsrt_value index) {
  if (!jsrt_is(array, JSRT_TAG_ARRAY)) {
    /* A lying receiver degrades to the dynamic read, so the static and dynamic index paths
     * agree by construction: nullish throws Node's reading-message, a primitive misses to
     * `undefined`, a fixed shape walks its descriptor. (A string answers `undefined` here where
     * Node answers the code unit -- the dynamic path's own gap, shared rather than doubled.) */
    return jsrt_get_prop(array, jsrt_shape_key(jsrt_to_string(index)), NULL);
  }
  const JSRTArray *a = jsrt_as_array(array);
  uint32_t i = 0;
  if (!index_of(index, &i) || i >= a->length) {
    return JSRT_UNDEFINED;
  }
  return a->elements[i];
}

void jsrt_array_set(jsrt_value array, jsrt_value index, jsrt_value element) {
  if (!jsrt_is(array, JSRT_TAG_ARRAY)) {
    /* Same degradation as the read: nullish throws Node's setting-message, a primitive throws
     * the dynamic write's TypeError, a fixed shape takes its existing-or-STA2004 path. */
    jsrt_set_prop(array, jsrt_shape_key(jsrt_to_string(index)), element, NULL);
    return;
  }
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
    jsrt_array_grow(a, i);
  }

  /* At this point `i <= a->length`, so the write either replaces an element or appends exactly
   * one -- no gap is possible, which is what the refusal above buys. */
  a->elements[i] = element;
  if (i >= a->length) {
    a->length = i + 1;
  }
}

/* -------------------------------------------------------------- objects */

jsrt_value jsrt_object_get_field(jsrt_value obj, uint32_t slot, const char *field) {
  if (jsrt_is_nullish(obj)) {
    char message[256];
    (void)snprintf(message, sizeof message, "Cannot read properties of %s (reading '%s')",
                   obj == JSRT_NULL ? "null" : "undefined", field);
    jsrt_throw_error(&jsrt_class_type_error, message);
    return JSRT_UNDEFINED;
  }
  return jsrt_as_object(obj)->fields[slot];
}

void jsrt_object_set(jsrt_value obj, uint32_t slot, jsrt_value v) {
  JSRTObject *object = jsrt_as_object(obj);
  if (object->frozen) {
    /* The class knows the field names, so the fixed-shape path names the property just as the
     * dynamic one does (jsrt_shape.c store_prop) -- Node's exact wording. */
    char msg[256];
    snprintf(msg, sizeof msg, "Cannot assign to read only property '%s' of object '#<Object>'",
             slot < object->cls->field_count ? object->cls->fields[slot] : "?");
    jsrt_throw_error(&jsrt_class_type_error, msg);
    return;
  }
  object->fields[slot] = v;
}
