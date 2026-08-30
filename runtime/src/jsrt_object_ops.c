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
  const bool dynamic = fixed->cls == &jsrt_class_dynamic;
  const JSRTDynObject *dyn = (const JSRTDynObject *)jsrt_ptr(v);
  const uint32_t count = dynamic ? jsrt_dyn_property_count(dyn) : fixed->cls->field_count;
  const JSRTShape **links = dynamic ? jsrt_dyn_property_order(dyn, count) : NULL;

  jsrt_value out = jsrt_array_new(0, NULL);
  for (uint32_t i = 0; i < count; i++) {
    const uint32_t slot = dynamic ? links[i]->offset : i;
    const char *key = dynamic ? links[i]->key : fixed->cls->fields[i];
    if (!dynamic && is_private_field(key)) {
      continue;
    }
    const jsrt_value value = dynamic ? dyn->slots[slot] : fixed->fields[slot];
    jsrt_value item;
    if (select == OBJ_KEYS) {
      item = key_string(key);
    } else if (select == OBJ_VALUES) {
      item = value;
    } else {
      const jsrt_value pair[2] = {key_string(key), value};
      item = jsrt_array_new(2, pair);
    }
    jsrt_array_push(out, item);
  }
  free((void *)links);
  return out;
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
  if (fixed->cls == &jsrt_class_dynamic) {
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
