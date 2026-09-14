/* Object.keys / Object.values / Object.entries (plan.md §7 Task 4.2), ECMA-262 §20.1.2.
 *
 * Two receiver layouts, one enumeration rule. A fixed-shape object's public keys are its class
 * descriptor's `fields` (private `#name` slots are filtered), already in declaration order; a
 * dynamic object's are its shape chain,
 * ordered by OrdinaryOwnPropertyKeys (canonical array-index keys numerically first, then the
 * remaining keys in insertion order). Source object literals only create identifier keys, but
 * Object.fromEntries and JSON.parse can create integer-like names, so the dynamic path must do the
 * full ordering rather than assume insertion order.
 *
 * Anything else at the argument position is a compiler bug — the gate restricts the argument to
 * the two object layouts — and panics as one (STA4084). */

#include <stdlib.h>
#include <string.h>

#include "jsrt.h"
#include "jsrt_value.h"

static jsrt_value key_string(const char *key) {
  return jsrt_string_from_utf8(key, strlen(key));
}

/* Private class names occupy slots for direct `#name` access, but they are not properties in the
 * ordinary property-key namespace.  The fixed-shape descriptor stores them alongside public
 * fields, so every reflective walk must filter them out.  A public field cannot start with `#` in
 * the subset: computed/string-literal class names are rejected by the frontend gate. */
static bool is_private_field(const char *key) { return key[0] == '#'; }

/* One walk serves all three entry points: what varies is only what each index becomes. */
typedef enum { OBJ_KEYS, OBJ_VALUES, OBJ_ENTRIES } ObjSelect;

static jsrt_value collect(jsrt_value v, ObjSelect select) {
  if (!jsrt_is(v, JSRT_TAG_OBJECT)) {
    jsrt_panic("STA4084: Object.keys/values/entries on a non-object value");
  }
  const JSRTObject *fixed = (const JSRTObject *)jsrt_ptr(v);
  const bool dynamic = jsrt_is_dynobj(v);
  const JSRTDynObject *dyn = (const JSRTDynObject *)jsrt_ptr(v);
  const uint32_t count = dynamic ? jsrt_shape_property_count(dyn->shape) : fixed->cls->field_count;
  const JSRTShape **links = dynamic ? jsrt_shape_property_order(dyn->shape, count) : NULL;

  /* A getter can allocate or collect; the partially built result is not reachable from v. */
  JSRT_FRAME(2);
  JSRT_LOCAL(0) = jsrt_array_new(0, NULL);
  for (uint32_t i = 0; i < count; i++) {
    const uint32_t slot = dynamic ? links[i]->offset : jsrt_class_key_slot(fixed->cls, i);
    const char *key = dynamic ? links[i]->key : fixed->cls->fields[slot];
    if (!dynamic && is_private_field(key)) {
      continue;
    }
    jsrt_value value = dynamic ? dyn->slots[slot] : fixed->fields[slot];
    /* An accessor's value is what its getter RETURNS: Object.values and Object.entries perform a
     * [[Get]], while Object.keys needs only the key and must not call anything. jsrt_get_prop is
     * the single place that knows how to resolve a cell, so the call is spelled as a property
     * read rather than repeated here. */
    if (select != OBJ_KEYS && jsrt_is_accessor_cell(value)) {
      value = jsrt_get_prop(v, key, NULL);
      if (jsrt_pending()) {
        free((void *)links);
        JSRT_FRAME_POP();
        return JSRT_UNDEFINED;
      }
    }
    jsrt_value item;
    if (select == OBJ_KEYS) {
      item = key_string(key);
    } else if (select == OBJ_VALUES) {
      item = value;
    } else {
      JSRT_LOCAL(1) = value;
      const jsrt_value pair[2] = {key_string(key), value};
      item = jsrt_array_new(2, pair);
    }
    JSRT_LOCAL(1) = item;
    jsrt_array_push(JSRT_LOCAL(0), JSRT_LOCAL(1));
  }
  free((void *)links);
  const jsrt_value result = JSRT_LOCAL(0);
  JSRT_FRAME_POP();
  return result;
}

jsrt_value jsrt_object_keys(jsrt_value v) { return collect(v, OBJ_KEYS); }

jsrt_value jsrt_object_values(jsrt_value v) { return collect(v, OBJ_VALUES); }

jsrt_value jsrt_object_entries(jsrt_value v) { return collect(v, OBJ_ENTRIES); }

/* getOwnPropertyNames answers the same list as keys for every object the subset can build: both
 * layouts hold only string-keyed, enumerable own properties -- a class field and a literal
 * property are both, and neither layout has a way to spell anything else. The two entry points
 * diverge when non-enumerable properties become expressible, which is the object model's job,
 * not this walk's. */
jsrt_value jsrt_object_get_own_property_names(jsrt_value v) { return collect(v, OBJ_KEYS); }

/* Object.hasOwn (§20.1.2.13). The shape chain and the class descriptor each list exactly the own
 * properties, so "own" needs no prototype question asked -- neither layout HAS a prototype the
 * subset can reach. The key arrives as a value because it is an arbitrary expression; the gate
 * has already held it to a string type. */
jsrt_value jsrt_object_has_own(jsrt_value v, jsrt_value key) {
  if (!jsrt_is(v, JSRT_TAG_OBJECT)) {
    jsrt_panic("STA4084: Object.hasOwn on a non-object value");
  }
  if (!jsrt_is(key, JSRT_TAG_STRING)) {
    jsrt_panic("STA2005: Object.hasOwn with a non-string key is not yet supported");
  }
  const JSRTObject *fixed = (const JSRTObject *)jsrt_ptr(v);
  if (jsrt_is_dynobj(v)) {
    return jsrt_bool(jsrt_has_prop(v, jsrt_shape_key(key)));
  }
  for (uint32_t i = 0; i < fixed->cls->field_count; i++) {
    if (is_private_field(fixed->cls->fields[i])) {
      continue;
    }
    if (jsrt_string_equals(key_string(fixed->cls->fields[i]), key)) {
      return JSRT_TRUE;
    }
  }
  return JSRT_FALSE;
}

/* Object.fromEntries (§20.1.2.7) over an ARRAY of pairs -- the iterable form the gate accepts.
 * The result is a dynamic object built key by key, so insertion order is the pair order and a
 * duplicate key resolves the way the shape table already resolves one: the later value wins and
 * the key keeps its first position. */
jsrt_value jsrt_object_from_entries(jsrt_value pairs) {
  if (!jsrt_is(pairs, JSRT_TAG_ARRAY)) {
    jsrt_panic("STA4084: Object.fromEntries on a value that is not an array");
  }
  jsrt_value out = jsrt_dynobj_new();
  const JSRTArray *list = jsrt_as_array(pairs);
  for (uint32_t i = 0; i < list->length; i++) {
    const jsrt_value pair = list->elements[i];
    if (!jsrt_is(pair, JSRT_TAG_ARRAY)) {
      jsrt_panic("STA2005: Object.fromEntries over entries that are not arrays is not yet "
                 "supported");
    }
    const JSRTArray *entry = jsrt_as_array(pair);
    const jsrt_value key = entry->length > 0 ? entry->elements[0] : JSRT_UNDEFINED;
    const jsrt_value value = entry->length > 1 ? entry->elements[1] : JSRT_UNDEFINED;
    if (!jsrt_is(key, JSRT_TAG_STRING)) {
      jsrt_panic("STA2005: Object.fromEntries with a non-string key is not yet supported");
    }
    jsrt_set_prop(out, jsrt_shape_key(key), value, NULL);
  }
  return out;
}

/* Object.assign (§20.1.2.1) in its two-argument form, copying the source's own enumerable string
 * keys onto the target and returning the target. The gate restricts the TARGET to a dynamic shape
 * for a reason a comment has to carry: a fixed shape's reads compile to slot indices decided at
 * build time, so a key this adds could never be read, and a key it overwrites is fine only because
 * the type system already listed it. A dynamic shape looks every key up through the shape table,
 * which is what makes a target that GROWS legal at all.
 *
 * Snapshot keys, not values: each source getter must run immediately before its target setter,
 * and an exception must prevent all subsequent gets and sets. */
jsrt_value jsrt_object_assign(jsrt_value target, jsrt_value source) {
  if (!jsrt_is_dynobj(target)) {
    jsrt_panic("STA4084: Object.assign onto a value that is not a dynamic-shape object");
  }
  const jsrt_value keys = collect(source, OBJ_KEYS);
  if (jsrt_pending()) {
    return JSRT_UNDEFINED;
  }
  const JSRTArray *list = jsrt_as_array(keys);
  for (uint32_t i = 0; i < list->length; i++) {
    const char *key = jsrt_shape_key(list->elements[i]);
    const jsrt_value value = jsrt_get_prop(source, key, NULL);
    if (jsrt_pending()) {
      return JSRT_UNDEFINED;
    }
    jsrt_set_prop(target, key, value, NULL);
    if (jsrt_pending()) {
      return JSRT_UNDEFINED;
    }
  }
  return target;
}


static bool is_fixed_shape_object(jsrt_value v) {
  if (!jsrt_is(v, JSRT_TAG_OBJECT) || jsrt_is_dynobj(v)) {
    return false;
  }
  const JSRTClass *cls = jsrt_as_object(v)->cls;
  return cls != &jsrt_class_promise && cls != &jsrt_class_date && cls != &jsrt_class_map &&
         cls != &jsrt_class_set && cls != &jsrt_class_regexp && cls != &jsrt_class_iterator &&
         cls != &jsrt_class_generator;
}

jsrt_value jsrt_object_freeze(jsrt_value v) {
  if (jsrt_is_dynobj(v)) {
    ((JSRTDynObject *)jsrt_ptr(v))->frozen = true;
    return v;
  }
  if (is_fixed_shape_object(v)) {
    jsrt_as_object(v)->frozen = true;
    return v;
  }
  return v;
}

jsrt_value jsrt_object_is_frozen(jsrt_value v) {
  if (jsrt_is_dynobj(v)) {
    return jsrt_bool(((const JSRTDynObject *)jsrt_ptr(v))->frozen);
  }
  if (is_fixed_shape_object(v)) {
    return jsrt_bool(jsrt_as_object(v)->frozen);
  }
  /* Primitives are frozen. Builtin objects this landing does not mark are not. */
  return jsrt_is(v, JSRT_TAG_OBJECT) || jsrt_is(v, JSRT_TAG_ARRAY) ? JSRT_FALSE : JSRT_TRUE;
}

/* ---------------------------------------------------------------- spread order
 *
 * `{ ...src }` enumerates in the SOURCE OBJECT's key order, not its type's field order
 * (plan.md §8 step 21a): a reordering annotation (`const o: { y: x } = { x, y }`) types the
 * fields one way while the object still enumerates the way it was built. The lowering expands
 * a spread into one read per field of the TYPE, which copies the right values into the right
 * slots but bakes the type's order into the result -- so the result's enumeration order is
 * repaired here, at run time, where the source's order lives.
 *
 * A fixed result's order lives in its shared descriptor (`JSRTClass::key_order`), which the
 * emitter chose at compile time -- so these three calls rebuild it after the values land: two
 * record first-occurrence order fragment by fragment (own keys, then each spread source in
 * ITS order), and the third interns the finished order as the result's descriptor. A dynamic
 * result keeps insertion order for free, so one call copies a whole spread source in order. */

static void order_append(uint32_t *order, uint32_t *count, uint32_t cap, uint32_t slot) {
  for (uint32_t i = 0; i < *count; i++) {
    if (order[i] == slot) {
      return;
    }
  }
  if (*count >= cap) {
    jsrt_panic("spread order overflow: more distinct keys than the result has slots");
  }
  order[(*count)++] = slot;
}

/* One own key of the literal, by its slot in the result layout. Later occurrences -- an
 * override after a spread that already contributed the key -- keep the first position, which
 * is §13.2.5.5's rule and falls out of the duplicate skip. */
void jsrt_spread_order_key(uint32_t *order, uint32_t *count, uint32_t cap, uint32_t slot) {
  order_append(order, count, cap, slot);
}

/* The destination slot a source key lands in, by name: the source layout is a SUBSET of the
 * result's (the gate held every spread operand to a fixed shape the result type covers), and
 * a key the result does not declare -- a class instance wider than its static type -- is one
 * the value copy skipped too, so the order skips it as well. */
static bool dst_slot_of(const JSRTClass *dst, const char *key, uint32_t *slot) {
  if (dst->fields == NULL) {
    return false;
  }
  for (uint32_t i = 0; i < dst->field_count; i++) {
    if (dst->fields[i] != NULL && strcmp(dst->fields[i], key) == 0) {
      *slot = i;
      return true;
    }
  }
  return false;
}

/* One spread fragment: every own key of the source that the result declares, in the SOURCE's
 * enumeration order. `#private` slots are not properties and never enter an order. A dynamic
 * source walks its shape chain; anything that is not an object at all is a compiler bug -- the
 * gate held the operand to a fixed shape. */
void jsrt_spread_order_src(uint32_t *order, uint32_t *count, uint32_t cap, jsrt_value dst,
                           jsrt_value src) {
  if (!jsrt_is(src, JSRT_TAG_OBJECT)) {
    jsrt_panic("object spread of a value that is not an object");
  }
  const JSRTClass *dc = jsrt_as_object(dst)->cls;
  if (jsrt_is_dynobj(src)) {
    const JSRTDynObject *dyn = (const JSRTDynObject *)jsrt_ptr(src);
    const uint32_t n = jsrt_shape_property_count(dyn->shape);
    const JSRTShape **links = jsrt_shape_property_order(dyn->shape, n);
    for (uint32_t i = 0; i < n; i++) {
      uint32_t slot = 0;
      if (dst_slot_of(dc, links[i]->key, &slot)) {
        order_append(order, count, cap, slot);
      }
    }
    free((void *)links);
    return;
  }
  const JSRTObject *fixed = jsrt_as_object(src);
  for (uint32_t i = 0; i < fixed->cls->field_count; i++) {
    const char *key = fixed->cls->fields[jsrt_class_key_slot(fixed->cls, i)];
    if (key != NULL && !is_private_field(key)) {
      uint32_t slot = 0;
      if (dst_slot_of(dc, key, &slot)) {
        order_append(order, count, cap, slot);
      }
    }
  }
}

/* One (layout, order) pair, interned for the life of the program: two spread results with the
 * same layout and the same order share one descriptor, the way two literals that wrote the same
 * keys share one today. Descriptors hold no values, so plain malloc is correct (the shape
 * table's rule, docs/VALUE.md §4.10). */
typedef struct OrderIntern {
  const JSRTClass *layout;
  uint32_t *order; /* length is layout->field_count */
  JSRTClass desc;
  struct OrderIntern *next;
} OrderIntern;

static OrderIntern *order_interns = NULL;

static const JSRTClass *shape_with_order(const JSRTClass *layout, const uint32_t *order) {
  const uint32_t n = layout->field_count;
  for (const OrderIntern *e = order_interns; e != NULL; e = e->next) {
    if (e->layout == layout && memcmp(e->order, order, (size_t)n * sizeof(uint32_t)) == 0) {
      return &e->desc;
    }
  }
  OrderIntern *e = (OrderIntern *)malloc(sizeof(OrderIntern) + (size_t)n * sizeof(uint32_t));
  if (e == NULL) {
    jsrt_panic("out of memory: spread order");
  }
  e->layout = layout;
  e->order = (uint32_t *)(e + 1);
  memcpy(e->order, order, (size_t)n * sizeof(uint32_t));
  e->desc = *layout;
  e->desc.key_order = e->order;
  e->next = order_interns;
  order_interns = e;
  return &e->desc;
}

/* Stamp the finished order onto a fresh fixed spread result and answer it for the emitter's
 * comma chains. Slots the fragments never mentioned -- unreachable through the gate, which
 * expands every field -- pad in layout order rather than dropping a key. An order that matches
 * the descriptor the emitter already chose interns nothing. */
jsrt_value jsrt_object_set_order(jsrt_value dst, const uint32_t *order, uint32_t count) {
  JSRTObject *o = jsrt_as_object(dst);
  const JSRTClass *layout = o->cls;
  const uint32_t n = layout->field_count;
  if (n == 0) {
    return dst;
  }
  uint32_t *full = (uint32_t *)malloc((size_t)n * sizeof(uint32_t));
  if (full == NULL) {
    jsrt_panic("out of memory: spread order");
  }
  uint32_t m = 0;
  for (uint32_t i = 0; i < count && m < n; i++) {
    if (order[i] >= n) {
      continue;
    }
    bool seen = false;
    for (uint32_t j = 0; j < m; j++) {
      if (full[j] == order[i]) {
        seen = true;
        break;
      }
    }
    if (!seen) {
      full[m++] = order[i];
    }
  }
  for (uint32_t s = 0; s < n; s++) {
    bool seen = false;
    for (uint32_t j = 0; j < m; j++) {
      if (full[j] == s) {
        seen = true;
        break;
      }
    }
    if (!seen) {
      full[m++] = s;
    }
  }
  bool same = true;
  if (layout->key_order != NULL) {
    for (uint32_t i = 0; i < n; i++) {
      if (layout->key_order[i] != full[i]) {
        same = false;
        break;
      }
    }
  } else {
    for (uint32_t i = 0; i < n; i++) {
      if (full[i] != i) {
        same = false;
        break;
      }
    }
  }
  if (!same) {
    o->cls = shape_with_order(layout, full);
  }
  free(full);
  return dst;
}

/* One spread fragment into a DYNAMIC result: every own key of a fixed-shape source, in the
 * source's enumeration order, through the same `jsrt_set_prop` the per-field expansion used --
 * so setter-vs-define answers do not change, only the insertion order does. Insertion order IS
 * enumeration order on a fresh shape table, which is why this result needs no repair call. */
jsrt_value jsrt_dynobj_spread(jsrt_value dst, jsrt_value src) {
  if (!jsrt_is(src, JSRT_TAG_OBJECT) || jsrt_is_dynobj(src)) {
    jsrt_panic("object spread of a value with no fixed shape");
  }
  const JSRTObject *fixed = jsrt_as_object(src);
  for (uint32_t i = 0; i < fixed->cls->field_count; i++) {
    const uint32_t slot = jsrt_class_key_slot(fixed->cls, i);
    const char *key = fixed->cls->fields[slot];
    if (key != NULL && !is_private_field(key)) {
      jsrt_set_prop(dst, key, fixed->fields[slot], NULL);
    }
  }
  return dst;
}
