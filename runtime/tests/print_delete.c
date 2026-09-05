/* print_delete.c — `delete` on the shape table (docs/VALUE.md §4.10, plan.md §8 step 2a(c)).
 *
 * Ground truth is Node: print_delete.mjs builds the SAME objects and deletes the same keys, in the
 * same order; `just runtime-test` diffs the two byte-for-byte.
 *
 * What this pins: a deleted key reads `undefined`, fails `in`, and leaves print and key order; a
 * re-add lands LAST (the shape is replayed from the survivors, not patched); deleting the only key
 * prints `{}`; an absent key answers true; an inline cache filled on a sibling of the same shape
 * still reads the right slot after one of the pair is deleted from (the deleted-from object moved
 * to a different shape, so the cache misses and re-resolves); and the refusals throw with Node's
 * message -- nullish receiver, frozen object, array `length`, string `length`/index.
 */

#include "corpus.h"

#include <stdio.h>

static JSRTIC ic_y; /* static, exactly as generated C would emit a property site's cache */

/* `delete obj[key]` the way generated C spells it: the answer is only meaningful when nothing is
 * pending; a pending TypeError is taken and its message printed, as a catch would. */
static void try_delete(jsrt_value obj, const char *key) {
  const bool answer = jsrt_delete_prop(obj, str(key));
  if (jsrt_pending()) {
    const jsrt_value error = jsrt_take_exception();
    jsrt_print(jsrt_get_prop(error, "message", NULL));
    return;
  }
  jsrt_print(jsrt_bool(answer));
}

int main(void) {
  jsrt_init();
  JSRT_FRAME(6);

  jsrt_value o = jsrt_dynobj_new();
  JSRT_LOCAL(0) = o;
  jsrt_set_prop(o, "a", num(1), NULL);
  jsrt_set_prop(o, "b", num(2), NULL);
  jsrt_set_prop(o, "c", num(3), NULL);
  try_delete(o, "b");
  jsrt_print(jsrt_get_prop(o, "b", NULL));
  jsrt_print(jsrt_bool(jsrt_in(str("b"), o)));
  jsrt_print(jsrt_object_keys(o));
  jsrt_print(o);
  jsrt_set_prop(o, "b", num(20), NULL);
  jsrt_print(o);
  try_delete(o, "b");
  try_delete(o, "b");
  try_delete(o, "zzz");

  /* Shape sharing across a delete: p and q share {x, y}; the cache filled on q keeps answering
   * q, and p -- now on {y} -- misses it and reads its own slot. */
  jsrt_value p = jsrt_dynobj_new();
  JSRT_LOCAL(1) = p;
  jsrt_set_prop(p, "x", num(1), NULL);
  jsrt_set_prop(p, "y", num(2), NULL);
  jsrt_value q = jsrt_dynobj_new();
  JSRT_LOCAL(2) = q;
  jsrt_set_prop(q, "x", num(3), NULL);
  jsrt_set_prop(q, "y", num(4), NULL);
  jsrt_print(jsrt_get_prop(q, "y", &ic_y));
  try_delete(p, "x");
  jsrt_print(jsrt_get_prop(q, "y", &ic_y));
  jsrt_print(jsrt_get_prop(p, "y", &ic_y));
  jsrt_print(jsrt_get_prop(p, "x", NULL)); /* a cache is per SITE, so a different key gets its own */
  jsrt_print(p);
  jsrt_print(q);

  /* Deleting the only key lands back on the root shape, which can grow again. */
  jsrt_value solo = jsrt_dynobj_new();
  JSRT_LOCAL(3) = solo;
  jsrt_set_prop(solo, "only", num(1), NULL);
  try_delete(solo, "only");
  jsrt_print(solo);
  jsrt_set_prop(solo, "again", num(2), NULL);
  jsrt_print(solo);

  /* The refusals. */
  try_delete(JSRT_NULL, "x");
  try_delete(JSRT_UNDEFINED, "x");
  jsrt_value frozen = jsrt_dynobj_new();
  JSRT_LOCAL(4) = frozen;
  jsrt_set_prop(frozen, "a", num(1), NULL);
  jsrt_object_freeze(frozen);
  try_delete(frozen, "a");
  try_delete(frozen, "nope");
  jsrt_print(frozen);
  const jsrt_value one = num(1);
  jsrt_value arr = jsrt_array_new(1, &one);
  JSRT_LOCAL(5) = arr;
  try_delete(arr, "length");
  try_delete(arr, "nope");
  try_delete(str("abc"), "length");
  try_delete(str("abc"), "0");
  try_delete(str("abc"), "3");
  try_delete(str("abc"), "x");

  JSRT_FRAME_POP();
  return 0;
}
