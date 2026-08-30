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
#include "jsrt_value.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

const JSRTClass jsrt_class_dynamic = {"", 0, NULL, NULL, 0, NULL};

/* The one shape with no key: every dynamic object starts here. Static, so "has no properties"
 * needs no allocation and compares by address. */
static JSRTShape shape_root = {NULL, NULL, 0, NULL, NULL};

/* Slot storage holds jsrt_values, so under Boehm it must be a COLLECTED allocation the collector
 * scans; the shapes themselves hold no values and are immortal metadata, so they use plain malloc
 * either way (a shape is never garbage: the table only grows, by design). */
static void *slots_alloc(size_t bytes) {
  void *p = jsrt_gc_alloc(bytes, "dynamic object slots");
  return p;
}

static uint32_t shape_slot_count(const JSRTShape *shape) {
  if (shape->key == NULL) {
    return 0;
  }
  return shape->offset + 1;
}

/* A property is an array index exactly when its canonical decimal spelling round-trips through
 * ToUint32 and is not 2^32-1.  Shape keys are UTF-8, so non-ASCII bytes and any leading zero make
 * the key an ordinary string. */
static bool array_index_value(const char *key, uint32_t *value) {
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

static bool property_before(const JSRTShape *a, const JSRTShape *b) {
  uint32_t ai = 0;
  uint32_t bi = 0;
  const bool a_is_index = array_index_value(a->key, &ai);
  const bool b_is_index = array_index_value(b->key, &bi);
  if (a_is_index != b_is_index) {
    return a_is_index;
  }
  if (a_is_index && ai != bi) {
    return ai < bi;
  }
  /* Distinct canonical index keys cannot tie; this offset tie-breaker preserves insertion order
   * for ordinary keys and keeps the sort deterministic if malformed metadata ever appears. */
  return a->offset < b->offset;
}

uint32_t jsrt_dyn_property_count(const JSRTDynObject *dyn) {
  return dyn->shape->key == NULL ? 0 : dyn->shape->offset + 1;
}

const JSRTShape **jsrt_dyn_property_order(const JSRTDynObject *dyn, uint32_t count) {
  const JSRTShape **links =
      (const JSRTShape **)malloc((size_t)count * sizeof(const JSRTShape *));
  if (links == NULL && count > 0) {
    jsrt_panic("out of memory: dynamic object keys");
  }
  for (const JSRTShape *s = dyn->shape; s != NULL && s->key != NULL; s = s->parent) {
    links[s->offset] = s;
  }
  /* Stable insertion sort is sufficient for shape-sized key sets and avoids a comparator carrying
   * hidden state.  Offset order is the insertion order for non-index keys. */
  for (uint32_t i = 1; i < count; i++) {
    const JSRTShape *current = links[i];
    uint32_t j = i;
    while (j > 0 && property_before(current, links[j - 1])) {
      links[j] = links[j - 1];
      j--;
    }
    links[j] = current;
  }
  return links;
}

static JSRTDynObject *as_dynobj(jsrt_value v, const char *op) {
  (void)op;
  /* A fixed-shape object CAN reach a dynamic site today, through structural aliasing the checker
   * blesses: `const a = { x: 1 }; const b: { x?: number } = a; b.x`. The value is a JSRTObject
   * with a slot layout, the site expects the shape table, and answering the read anyway would be
   * silently wrong for exactly the values where it matters — so it is a loud runtime not-yet
   * until Phase 5 teaches these entry points to read through a JSRTClass descriptor. */
  if (jsrt_is(v, JSRT_TAG_OBJECT) &&
      ((const JSRTObject *)jsrt_ptr(v))->cls != &jsrt_class_dynamic) {
    jsrt_panic(
        "STA2004: a statically-shaped object reached a dynamic property site; planned for Phase 5");
  }
  /* Anything else — a primitive, an array, a closure, nullish — the compiler cannot emit a
   * dynamic site for at all, so reaching here with one is a compiler bug, not a program state. */
  if (!jsrt_is(v, JSRT_TAG_OBJECT)) {
    jsrt_panic("STA4058: dynamic property access on a non-object value");
  }
  return (JSRTDynObject *)jsrt_ptr(v);
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

jsrt_value jsrt_dynobj_new(void) {
  JSRTDynObject *o = (JSRTDynObject *)slots_alloc(sizeof(JSRTDynObject));
  o->cls = &jsrt_class_dynamic;
  o->shape = &shape_root;
  o->capacity = 0;
  o->slots = NULL;
  return JSRT_BOX(JSRT_TAG_OBJECT, (uintptr_t)o);
}

/* The chain walk both get and set share: the object's live keys are exactly the keys on the path
 * from its shape back to the root. Pointer compare first — generated C passes string literals,
 * and the transition that created the shape stored that same literal — with strcmp as the
 * correctness backstop for a key spelled at two sites. */
static const JSRTShape *shape_find(const JSRTShape *shape, const char *key) {
  for (const JSRTShape *s = shape; s->key != NULL; s = s->parent) {
    if (s->key == key || strcmp(s->key, key) == 0) {
      return s;
    }
  }
  return NULL;
}

jsrt_value jsrt_get_prop(jsrt_value obj, const char *key, JSRTIC *ic) {
  JSRTDynObject *o = as_dynobj(obj, "get");
  if (ic != NULL && ic->shape == o->shape) {
    return o->slots[ic->offset];
  }
  const JSRTShape *hit = shape_find(o->shape, key);
  if (hit == NULL) {
    return JSRT_UNDEFINED;
  }
  if (ic != NULL) {
    ic->shape = o->shape;
    ic->offset = hit->offset;
  }
  return o->slots[hit->offset];
}

bool jsrt_has_prop(jsrt_value obj, const char *key) {
  JSRTDynObject *o = as_dynobj(obj, "has");
  return shape_find(o->shape, key) != NULL;
}

void jsrt_set_prop(jsrt_value obj, const char *key, jsrt_value value, JSRTIC *ic) {
  JSRTDynObject *o = as_dynobj(obj, "set");
  if (ic != NULL && ic->shape == o->shape) {
    o->slots[ic->offset] = value;
    return;
  }
  const JSRTShape *hit = shape_find(o->shape, key);
  if (hit != NULL) {
    if (ic != NULL) {
      ic->shape = o->shape;
      ic->offset = hit->offset;
    }
    o->slots[hit->offset] = value;
    return;
  }

  /* New property: take (or build) the transition. Reuse before allocation is what keeps two
   * same-history objects on ONE shape. */
  JSRTShape *next = NULL;
  for (JSRTShape *s = o->shape->transitions; s != NULL; s = s->sibling) {
    if (s->key == key || strcmp(s->key, key) == 0) {
      next = s;
      break;
    }
  }
  if (next == NULL) {
    next = (JSRTShape *)malloc(sizeof(JSRTShape));
    if (next == NULL) {
      jsrt_panic("out of memory: shape");
    }
    next->parent = o->shape;
    next->key = key;
    next->offset = shape_slot_count(o->shape);
    next->transitions = NULL;
    next->sibling = o->shape->transitions;
    o->shape->transitions = next;
  }

  if (next->offset >= o->capacity) {
    /* Double from 4 so repeated additions stay amortized O(1). The old slots are copied, not
     * reallocated in place: under Boehm the old block is simply dropped for the collector. */
    uint32_t grown = o->capacity == 0 ? 4 : o->capacity * 2;
    jsrt_value *fresh = (jsrt_value *)slots_alloc((size_t)grown * sizeof(jsrt_value));
    for (uint32_t i = 0; i < o->capacity; i++) {
      fresh[i] = o->slots[i];
    }
#ifndef JSRT_HAVE_BOEHM
    free(o->slots);
#endif
    o->slots = fresh;
    o->capacity = grown;
  }
  o->slots[next->offset] = value;
  /* Transitions are not IC-cached: each object performs a given addition exactly once, so a
   * transition cache would only ever hit across objects — worth building when Phase 5 measures
   * construction-heavy dynamic code, not before. */
  o->shape = next;
}
