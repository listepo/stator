/* jsrt_shape.c — dynamic objects: the shape table (hidden classes) and inline caches.
 *
 * Design and invariants: docs/VALUE.md §4.10 and the header block over JSRTShape. What this file
 * has to get right, beyond the structures: an IC is filled ONLY on a hit against the object's
 * current shape, so a filled cache can be trusted by pointer compare alone; a get MISS is never
 * cached (the object can gain the key later under a different shape); and a transition reuses an
 * existing child before allocating, because shape sharing is the entire point — two objects that
 * gained the same keys in the same order must land on the same shape or every IC downstream of
 * them degrades to the slow path.
 */

#include "jsrt.h"
#include "jsrt_mem.h"
#include "jsrt_value.h"

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <assert.h>

const JSRTClass jsrt_class_dynamic = {"", 0, NULL, NULL, 0, NULL, NULL, NULL};

/* Identical to `jsrt_class_dynamic` in every field that means anything -- the SHAPE owns the layout
 * -- and distinct from it by address, which is the whole job: it marks the objects §22.2.7.2 builds
 * with a null prototype so the printer writes Node's `[Object: null prototype]` prefix. */
const JSRTClass jsrt_class_null_proto = {"", 0, NULL, NULL, 0, NULL, NULL, NULL};

/* The descriptor that marks an accessor CELL (docs/VALUE.md §4.15). Like the two above it means
 * nothing by its fields and everything by its address: a property read tests the value it just
 * loaded against this pointer to tell a get/set pair from an ordinary property value. Nothing in
 * the language can build one, so the test cannot be fooled -- jsrt_define_accessor is the only
 * producer. */
const JSRTClass jsrt_class_accessor = {"", 0, NULL, NULL, 0, NULL, NULL, NULL};

/* Slot storage holds jsrt_values, so under Boehm it must be a COLLECTED allocation the collector
 * scans; the shapes themselves hold no values and are immortal metadata, so they use plain malloc
 * either way (a shape is never garbage: the table only grows, by design). */
static void *slots_alloc(size_t bytes) {
  void *p = jsrt_gc_alloc(bytes, "dynamic object slots");
  return p;
}

/* A property is an array index exactly when its canonical decimal spelling round-trips through
 * ToUint32 and is not 2^32-1. Shape keys are UTF-8, so non-ASCII bytes and any leading zero make
 * the key an ordinary string. Fixed-shape enumeration (jsrt_fixed_key_order below) shares this
 * test: a string-literal key like "1" in a fixed layout is an index exactly as it is in a shape. */
bool jsrt_key_is_array_index(const char *key, uint32_t *value) {
  if (key[0] == '\0' || (key[0] == '0' && key[1] != '\0')) {
    return false;
  }
  uint64_t parsed = 0;
  for (const unsigned char *p = (const unsigned char *)key; *p != '\0'; p++) {
    if (*p < '0' || *p > '9') {
      return false;
    }
    const uint64_t digit = (uint64_t)(*p - '0');
    if (parsed > ((uint64_t)UINT32_MAX - 1u - digit) / 10u) {
      return false;
    }
    parsed = parsed * 10u + digit;
  }
  *value = (uint32_t)parsed;
  return true;
}

/* The shape table itself -- the root, the chain walk, transitions, slot growth, key order and the
 * delete replay -- is jsrt_shape.zig (declared in jsrt_mem.h), and the dynamic-object allocators
 * are jsrt_alloc.zig. What stays here is property SEMANTICS over that table: inline caches,
 * accessors, the fixed-layout fallbacks and every TypeError the language names. */

/* Whether slot `a` enumerates before slot `b` of the same fixed layout. Canonical array-index
 * keys come first in ascending numeric order; ordinary keys never move relative to each other,
 * so the sort below is stable by construction and needs no tie-breaker (two distinct canonical
 * index spellings cannot share a value). */
static bool fixed_before(const JSRTClass *cls, uint32_t a, uint32_t b) {
  uint32_t ai = 0;
  uint32_t bi = 0;
  const bool a_is_index = jsrt_key_is_array_index(cls->fields[a], &ai);
  const bool b_is_index = jsrt_key_is_array_index(cls->fields[b], &bi);
  if (a_is_index != b_is_index) {
    return a_is_index;
  }
  return a_is_index && ai < bi;
}

uint32_t *jsrt_fixed_key_order(const JSRTClass *cls, uint32_t *count_out) {
  const uint32_t n = cls->field_count;
  /* Visible slots in insertion (key_order) sequence first; the partition below only reorders. */
  uint32_t *order = (uint32_t *)malloc((size_t)(n == 0 ? 1 : n) * sizeof(uint32_t));
  if (order == NULL) {
    jsrt_panic("out of memory: fixed object keys");
  }
  uint32_t m = 0;
  if (cls->fields != NULL) {
    for (uint32_t i = 0; i < n; i++) {
      const uint32_t slot = jsrt_class_key_slot(cls, i);
      const char *key = slot < n ? cls->fields[slot] : NULL;
      /* `#private` slots are storage, not properties -- every reflective walk filters them,
       * and the filter lives here once rather than in each caller. */
      if (key != NULL && key[0] != '#') {
        order[m++] = slot;
      }
    }
  }
  /* Stable insertion sort, field-count-sized like the shape walk above. */
  for (uint32_t i = 1; i < m; i++) {
    const uint32_t current = order[i];
    uint32_t j = i;
    while (j > 0 && fixed_before(cls, current, order[j - 1])) {
      order[j] = order[j - 1];
      j--;
    }
    order[j] = current;
  }
  *count_out = m;
  return order;
}

static JSRTDynObject *as_dynobj(jsrt_value v, const char *op) {
  (void)op;
  return (JSRTDynObject *)jsrt_ptr(v);
}

static bool has_prop_table(jsrt_value v) {
  return jsrt_is(v, JSRT_TAG_ARRAY) || jsrt_is_dynobj(v);
}

static int32_t fixed_slot(jsrt_value obj, const char *key) {
  JSRTObject *o = jsrt_as_object(obj);
  const JSRTClass *cls = o->cls;
  if (cls->fields == NULL) {
    return -1;
  }
  for (uint32_t i = 0; i < cls->field_count; i++) {
    const char *name = cls->fields[i];
    if (name != NULL && (name == key || strcmp(name, key) == 0)) {
      return (int32_t)i;
    }
  }
  return -1;
}

/* Dynamic method dispatch through Unknown (plan.md §8 step 45): a fixed-shape object's methods
 * live in no slot `fixed_get` walks -- an object-literal method rides a hidden trailing
 * `#method:<name>` slot bound per evaluation, a class method rides the descriptor's method
 * table -- so a shape-table read of a method NAME missed to `undefined` and the following call
 * aborted STA2006 where Node runs. Own data properties shadow: the caller asks only on a field
 * miss, and a hit never fills the IC (a bound closure belongs to one receiver for literals,
 * and the IC fast path trusts a shape match for the site's key alone).
 *
 * Sets `*found` true on a hit and answers the closure; otherwise sets it false and answers
 * `undefined`. A NULL table entry (a capturing method with no one constant form) is skipped,
 * leaving the hidden slot -- which carries the construction-site environment -- as the hit.
 * Accessors (`get x`) are not methods under `x` and never match here. */
static jsrt_value fixed_method_get(jsrt_value obj, const char *key, bool *found) {
  JSRTObject *o = jsrt_as_object(obj);
  const JSRTClass *cls = o->cls;
  if (cls->fields != NULL) {
    for (uint32_t i = 0; i < cls->field_count; i++) {
      const char *name = cls->fields[i];
      if (name != NULL && strncmp(name, "#method:", 8) == 0 && strcmp(name + 8, key) == 0) {
        *found = true;
        return o->fields[i];
      }
    }
  }
  if (cls->method_names != NULL && cls->methods != NULL) {
    for (uint32_t i = 0; i < cls->method_count; i++) {
      const char *name = cls->method_names[i];
      const JSRTClosure *entry = cls->methods[i];
      if (name != NULL && entry != NULL && (name == key || strcmp(name, key) == 0)) {
        *found = true;
        return jsrt_closure(entry);
      }
    }
  }
  *found = false;
  return JSRT_UNDEFINED;
}

static bool fixed_set(jsrt_value obj, const char *key, jsrt_value value) {
  const int32_t slot = fixed_slot(obj, key);
  if (slot < 0) {
    return false;
  }
  jsrt_as_object(obj)->fields[slot] = value;
  return true;
}

static bool fixed_has(jsrt_value obj, const char *key) { return fixed_slot(obj, key) >= 0; }

/* The property table, as the two receivers that own one both expose it: a dynamic object keeps it
 * inline, an array keeps it beside its elements. Everything below walks this view, so a match
 * array's `m.index` and a `{ }` receiver's `o.x` are literally the same code path -- which is what
 * makes an inline cache filled at one site valid however the value was built. */
typedef struct {
  JSRTShape **shape;
  jsrt_value **slots;
  uint32_t *capacity;
} PropTable;

static PropTable as_prop_table(jsrt_value v, const char *op) {
  if (jsrt_is(v, JSRT_TAG_ARRAY)) {
    JSRTArray *a = jsrt_as_array(v);
    if (a->shape == NULL) {
      a->shape = &jsrt_shape_root; /* first touch: an ordinary array pays nothing until here */
    }
    return (PropTable){&a->shape, &a->slots, &a->slot_capacity};
  }
  JSRTDynObject *o = as_dynobj(v, op);
  return (PropTable){&o->shape, &o->slots, &o->capacity};
}

/* A shape key from a JS string. The shape table stores keys as NUL-terminated UTF-8 and keeps the
 * pointer forever, so the copy is deliberately immortal -- exactly the lifetime shapes already
 * have, and the reason this is plain malloc rather than a collected allocation. Surrogate pairs
 * combine into one code point; a lone surrogate is encoded as itself. U+0000 has no
 * representation in a C string and aborts loudly rather than truncating the key silently. */
const char *jsrt_shape_key(jsrt_value name) {
  const uint32_t len = jsrt_string_length(name);
  /* Worst case is three bytes per code unit: an astral PAIR takes four bytes for two units. */
  char *key = (char *)malloc((size_t)len * 3 + 1);
  if (key == NULL) {
    jsrt_panic("out of memory: shape key");
  }
  size_t k = 0;
  for (uint32_t i = 0; i < len; i++) {
    uint32_t cp = jsrt_string_char(name, i);
    if (cp == 0) {
      jsrt_panic("STA2005: a property key containing U+0000 is not yet representable");
    }
    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < len) {
      const uint16_t trail = jsrt_string_char(name, i + 1);
      if (trail >= 0xDC00 && trail <= 0xDFFF) {
        cp = 0x10000 + ((cp - 0xD800) << 10) + (trail - 0xDC00);
        i++;
      }
    }
    if (cp < 0x80) {
      key[k++] = (char)cp;
    } else if (cp < 0x800) {
      key[k++] = (char)(0xC0 | (cp >> 6));
      key[k++] = (char)(0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
      key[k++] = (char)(0xE0 | (cp >> 12));
      key[k++] = (char)(0x80 | ((cp >> 6) & 0x3F));
      key[k++] = (char)(0x80 | (cp & 0x3F));
    } else {
      key[k++] = (char)(0xF0 | (cp >> 18));
      key[k++] = (char)(0x80 | ((cp >> 12) & 0x3F));
      key[k++] = (char)(0x80 | ((cp >> 6) & 0x3F));
      key[k++] = (char)(0x80 | (cp & 0x3F));
    }
  }
  key[k] = '\0';
  return key;
}

static jsrt_value dynobj_new(const JSRTClass *cls) {
  JSRTDynObject *o = (JSRTDynObject *)slots_alloc(sizeof(JSRTDynObject));
  o->cls = cls;
  o->shape = &jsrt_shape_root;
  o->capacity = 0;
  o->slots = NULL;
  o->frozen = false;
  return JSRT_BOX(JSRT_TAG_OBJECT, (uintptr_t)o);
}

jsrt_value jsrt_dynobj_new(void) { return dynobj_new(&jsrt_class_dynamic); }

jsrt_value jsrt_null_proto_new(void) { return dynobj_new(&jsrt_class_null_proto); }

/* A loaded slot, resolved. An accessor cell becomes a call with the receiver as argument zero --
 * the ordinary method ABI (docs/VALUE.md §4.5), so an accessor body is an ordinary function unit.
 * A cell with no getter reads `undefined`, which is what §10.4.x AccessorDescriptor Get answers
 * when [[Get]] is undefined. */
static jsrt_value accessor_read(jsrt_value slot, jsrt_value recv) {
  if (!jsrt_is_accessor_cell(slot)) {
    return slot;
  }
  const JSRTAccessorCell *cell = (const JSRTAccessorCell *)jsrt_ptr(slot);
  return cell->get == JSRT_UNDEFINED ? JSRT_UNDEFINED : jsrt_call(cell->get, 1, &recv);
}

/* Answers whether the write was an accessor's, so the caller knows not to store. A setter-less
 * accessor THROWS rather than silently dropping the write: compiled modules are always strict, and
 * strict mode is where §10.4.x OrdinarySetWithOwnDescriptor returns false and the assignment
 * raises. Node's wording, matched exactly. */
static bool accessor_write(jsrt_value slot, const char *key, jsrt_value recv, jsrt_value value) {
  if (!jsrt_is_accessor_cell(slot)) {
    return false;
  }
  const JSRTAccessorCell *cell = (const JSRTAccessorCell *)jsrt_ptr(slot);
  if (cell->set == JSRT_UNDEFINED) {
    char msg[192];
    snprintf(msg, sizeof msg, "Cannot set property %s of #<Object> which has only a getter", key);
    jsrt_throw_error(&jsrt_class_type_error, msg);
    return true;
  }
  jsrt_value args[2] = {recv, value};
  jsrt_call(cell->set, 2, args);
  return true;
}

/* `fn.length` on a statically-typed function value: the declared arity, which never counts
 * a method's receiver (docs/VALUE.md §4.16, plan.md §8 step 21b). The dynamic path answers the
 * same field through `jsrt_get_prop` below. */
uint32_t jsrt_closure_arity(jsrt_value v) {
  assert(jsrt_is(v, JSRT_TAG_CLOSURE));
  return jsrt_as_closure(v)->arity;
}

jsrt_value jsrt_get_prop(jsrt_value obj, const char *key, JSRTIC *ic) {
  if (jsrt_is_nullish(obj)) {
    char message[256];
    snprintf(message, sizeof message, "Cannot read properties of %s (reading '%s')",
             obj == JSRT_NULL ? "null" : "undefined", key);
    jsrt_throw_error(&jsrt_class_type_error, message);
    return JSRT_UNDEFINED;
  }
  if (jsrt_is(obj, JSRT_TAG_ARRAY) && strcmp(key, "length") == 0) {
    return jsrt_number((double)jsrt_as_array(obj)->length);
  }
  /* `fn.length` on a function value is its declared arity -- the closure's own field, which
   * never counts a method's receiver (docs/VALUE.md §4.16, plan.md §8 step 21b). A closure has
   * no shape, so without this the read falls through to the table walk and answers
   * `undefined` where Node answers the arity. */
  if (jsrt_is(obj, JSRT_TAG_CLOSURE) && strcmp(key, "length") == 0) {
    return jsrt_number((double)jsrt_as_closure(obj)->arity);
  }
  if (!has_prop_table(obj)) {
    if (jsrt_is(obj, JSRT_TAG_OBJECT)) {
      const int32_t slot = fixed_slot(obj, key);
      if (slot >= 0) {
        return jsrt_as_object(obj)->fields[slot];
      }
      bool found = false;
      const jsrt_value method = fixed_method_get(obj, key, &found);
      if (found) {
        return method;
      }
      return JSRT_UNDEFINED;
    }
    if (jsrt_is(obj, JSRT_TAG_STRING) && strcmp(key, "length") == 0) {
      return jsrt_number((double)jsrt_string_length(obj));
    }
    return JSRT_UNDEFINED;
  }
  const PropTable o = as_prop_table(obj, "get");
  if (ic != NULL && ic->shape == *o.shape) {
    return accessor_read((*o.slots)[ic->offset], obj);
  }
  const JSRTShape *hit = jsrt_shape_find(*o.shape, key);
  if (hit == NULL) {
    /* Array.prototype as values (plan.md §8 step 20): the walk above covers own properties
     * only, so `a.push` on an array fell through to `undefined` and the call aborted STA2006
     * where Node runs. Own properties shadow -- this asks only on a miss -- and a method hit
     * never fills the IC, whose fast path trusts a shape match for the site's key alone while a
     * bound method belongs to one receiver. */
    jsrt_value method = JSRT_UNDEFINED;
    if (jsrt_is(obj, JSRT_TAG_ARRAY) && jsrt_array_method(obj, key, &method)) {
      return method;
    }
    return JSRT_UNDEFINED;
  }
  if (ic != NULL) {
    ic->shape = *o.shape;
    ic->offset = hit->offset;
  }
  return accessor_read((*o.slots)[hit->offset], obj);
}

bool jsrt_has_prop(jsrt_value obj, const char *key) {
  if (jsrt_is_nullish(obj)) {
    return false;
  }
  if (!has_prop_table(obj)) {
    if (jsrt_is(obj, JSRT_TAG_OBJECT)) {
      return fixed_has(obj, key);
    }
    return jsrt_is(obj, JSRT_TAG_STRING) && strcmp(key, "length") == 0;
  }
  const PropTable o = as_prop_table(obj, "has");
  return jsrt_shape_find(*o.shape, key) != NULL;
}

bool jsrt_in(jsrt_value key, jsrt_value obj) {
  if (jsrt_is_nullish(obj)) {
    jsrt_throw_error(&jsrt_class_type_error,
                     "Cannot use 'in' operator to search for a value in null or undefined");
    return false;
  }
  const char *k = jsrt_shape_key(jsrt_to_string(key));
  if (!jsrt_is_object(obj)) {
    /* §13.10.1 step 6: the RIGHT operand must be an Object, and a primitive is not one -- so the
     * answer is a TypeError, never a boolean. Two wrong answers lived here: `"length" in "abc"`
     * reported `true` through the string branch of `jsrt_has_prop`, and any other primitive
     * reported `false`, so a thrown error was hidden behind an ordinary value (plan-notes 220).
     * Node's wording names both operands, so the receiver goes through ToString like the key. */
    const char *receiver = jsrt_shape_key(jsrt_to_string(obj));
    char message[256];
    snprintf(message, sizeof message, "Cannot use 'in' operator to search for '%s' in %s", k,
             receiver);
    jsrt_throw_error(&jsrt_class_type_error, message);
    free((void *)receiver);
    free((void *)k);
    return false;
  }
  bool answer = false;
  if (jsrt_is(obj, JSRT_TAG_ARRAY)) {
    /* An INDEX test, not a decimal parse: `strtoul` accepts a sign and leading zeros, so `'01' in
     * a`, `'+1' in a` and `'-0' in a` all answered `true` where Node answers `false`. The canonical
     * spelling `jsrt_key_is_array_index` is the one test the rest of this file uses. */
    uint32_t index = 0;
    answer = strcmp(k, "length") == 0 ||
             (jsrt_key_is_array_index(k, &index) && index < jsrt_as_array(obj)->length);
  }
  if (!answer) {
    answer = jsrt_has_prop(obj, k);
  }
  /* Compared only -- nothing here keeps the key, unlike a write that installs it in a shape -- so
   * this copy dies with the call instead of joining the immortal shape table. */
  free((void *)k);
  return answer;
}

/* `honor_accessor` is false for exactly one caller: jsrt_define_accessor, which is INSTALLING the
 * cell and must overwrite whatever the key held rather than invoke it. Every other write honors it,
 * which is what makes `o.x = v` on an accessor a call. */
static void store_prop(jsrt_value obj, const char *key, jsrt_value value, JSRTIC *ic,
                       bool honor_accessor) {
  if (jsrt_is_nullish(obj)) {
    char message[256];
    snprintf(message, sizeof message, "Cannot set properties of %s (setting '%s')",
             obj == JSRT_NULL ? "null" : "undefined", key);
    jsrt_throw_error(&jsrt_class_type_error, message);
    return;
  }
  if (jsrt_is_dynobj(obj) && ((JSRTDynObject *)jsrt_ptr(obj))->frozen) {
    /* Node's exact wording, property name included -- a frozen-write TypeError that did not say
     * WHICH property is the least useful half of the message (plan.md §8 step 2a(c)). */
    char msg[256];
    snprintf(msg, sizeof msg, "Cannot assign to read only property '%s' of object '#<Object>'", key);
    jsrt_throw_error(&jsrt_class_type_error, msg);
    return;
  }
  if (!has_prop_table(obj)) {
    if (jsrt_is(obj, JSRT_TAG_OBJECT)) {
      if (fixed_set(obj, key, value)) {
        return;
      }
      jsrt_panic(
          "STA2004: a statically-shaped object cannot grow a new property; planned for Phase 8");
    }
    jsrt_throw_error(&jsrt_class_type_error, "Cannot set properties of a primitive");
    return;
  }
  const PropTable o = as_prop_table(obj, "set");
  if (ic != NULL && ic->shape == (*o.shape)) {
    if (honor_accessor && accessor_write((*o.slots)[ic->offset], key, obj, value)) {
      return;
    }
    (*o.slots)[ic->offset] = value;
    return;
  }
  const JSRTShape *hit = jsrt_shape_find((*o.shape), key);
  if (hit != NULL) {
    if (ic != NULL) {
      ic->shape = (*o.shape);
      ic->offset = hit->offset;
    }
    if (honor_accessor && accessor_write((*o.slots)[hit->offset], key, obj, value)) {
      return;
    }
    (*o.slots)[hit->offset] = value;
    return;
  }

  /* New property: take (or build) the transition, and make its slot writable. */
  JSRTShape *next = jsrt_shape_transition((*o.shape), key);
  jsrt_shape_reserve(o.slots, o.capacity, next->offset);
  (*o.slots)[next->offset] = value;
  /* Transitions are not IC-cached: each object performs a given addition exactly once, so a
   * transition cache would only ever hit across objects — worth building when Phase 5 measures
   * construction-heavy dynamic code, not before. */
  (*o.shape) = next;
}

void jsrt_set_prop(jsrt_value obj, const char *key, jsrt_value value, JSRTIC *ic) {
  store_prop(obj, key, value, ic, true);
}

void jsrt_define_accessor(jsrt_value obj, const char *key, jsrt_value get, jsrt_value set) {
  JSRTAccessorCell *cell = (JSRTAccessorCell *)slots_alloc(sizeof(JSRTAccessorCell));
  cell->cls = &jsrt_class_accessor;
  cell->get = get;
  cell->set = set;
  /* No IC: installation happens once per object at construction, so a cache would never hit. */
  store_prop(obj, key, JSRT_BOX(JSRT_TAG_OBJECT, (uintptr_t)cell), NULL, false);
}

bool jsrt_delete(jsrt_value obj, jsrt_value key) {
  if (jsrt_is_nullish(obj)) {
    jsrt_throw_error(&jsrt_class_type_error, "Cannot convert undefined or null to object");
    return false;
  }
  /* Owned here, unlike every other shape key: a delete only COMPARES the key -- the chain it
   * replays carries the immortal keys the old shapes already held -- so this copy dies with the
   * call instead of joining the table. */
  const char *k = jsrt_shape_key(jsrt_to_string(key));
  bool answer = true;
  if (jsrt_is(obj, JSRT_TAG_ARRAY)) {
    uint32_t index = 0;
    /* A dense array has no representation for an absent element: `delete a[1]` must leave a HOLE
     * that `1 in a` denies and iteration skips, and `undefined` is not that (plan.md §8 step 2a(c);
     * the same gap gateArrayLiteral names for `[1, , 3]`). `length` is non-configurable, which is
     * a different refusal the same absence blocks from being spelled honestly. */
    if (strcmp(k, "length") == 0 ||
        (jsrt_key_is_array_index(k, &index) && index < jsrt_as_array(obj)->length)) {
      jsrt_panic("STA2007: an array element cannot be deleted; planned for Phase 5 (array holes)");
    }
  } else if (!has_prop_table(obj)) {
    /* A fixed layout is slots at compile-time offsets; a missing one has no encoding. Deleting a
     * key it never had is still `true` -- there was nothing to remove. Symmetric with STA2004,
     * and it lifts with the same Phase 8 dictionary-mode escape.
     *
     * FROZEN is the one fixed-shape delete with a right answer, and it is the answer: a frozen
     * property is non-configurable, so the spec's `delete` raises in strict mode and never has to
     * reach a representation the layout does not have (plan.md §8 step 2a(c), bucket 2704). */
    if (jsrt_is(obj, JSRT_TAG_OBJECT) && fixed_has(obj, k)) {
      if (jsrt_as_object(obj)->frozen) {
        char msg[256];
        snprintf(msg, sizeof msg, "Cannot delete property '%s' of #<Object>", k);
        jsrt_throw_error(&jsrt_class_type_error, msg);
        free((void *)k);
        return false;
      }
      jsrt_panic(
          "STA2007: a statically-shaped object cannot lose a property; planned for Phase 8");
    }
    free((void *)k);
    return true;
  }
  const PropTable o = as_prop_table(obj, "delete");
  const JSRTShape *hit = jsrt_shape_find(*o.shape, k);
  if (hit == NULL) {
    /* Absent is `true` even on a frozen object: §13.5.1.2 asks [[Delete]], and deleting what is
     * not there succeeds. Only an existing non-configurable property raises. */
    free((void *)k);
    return true;
  }
  if (jsrt_is_dynobj(obj) && ((JSRTDynObject *)jsrt_ptr(obj))->frozen) {
    char msg[256];
    snprintf(msg, sizeof msg, "Cannot delete property '%s' of #<Object>", k);
    jsrt_throw_error(&jsrt_class_type_error, msg);
    answer = false;
  } else {
    jsrt_shape_remove(o.shape, *o.slots, hit);
  }
  free((void *)k);
  return answer;
}

jsrt_value jsrt_dyn_index_get(jsrt_value obj, jsrt_value index, JSRTIC *ic) {
  if (jsrt_is(obj, JSRT_TAG_ARRAY)) {
    return jsrt_array_get(obj, index);
  }
  return jsrt_get_prop(obj, jsrt_shape_key(jsrt_to_string(index)), ic);
}

void jsrt_dyn_index_set(jsrt_value obj, jsrt_value index, jsrt_value value, JSRTIC *ic) {
  if (jsrt_is(obj, JSRT_TAG_ARRAY)) {
    jsrt_array_set(obj, index, value);
    return;
  }
  jsrt_set_prop(obj, jsrt_shape_key(jsrt_to_string(index)), value, ic);
}
