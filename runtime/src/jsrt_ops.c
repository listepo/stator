/* jsrt_ops.c — arithmetic and relational operators.
 *
 * Implements the `+` operator and relational comparisons (<, >, <=, >=)
 * according to ECMA-262.
 *
 * Key insight for `+`: if EITHER operand is a string, ToString both and
 * concatenate; otherwise ToNumber both and add. This is NOT symmetric with
 * other operators.
 *
 * Relational comparisons are symmetric: both strings -> lexicographic;
 * at least one non-string -> numeric.
 */

#include "jsrt_value.h"

#include <math.h>
#include <stdbool.h>

/* ============================================================================
 * ToPrimitive — ECMA-262 §7.1.1, docs/NUMERIC.md §7
 * ============================================================================ */

/* Every operator below is defined on primitives; an object reaches one only through here.
 *
 * The spec's ladder is valueOf-then-toString (or the reverse, for hint `string`), and in this
 * subset every rung but the last is unreachable: no object carries a user `valueOf`, and the
 * inherited one answers with the object itself, which is not a primitive. So both hints land on
 * `toString`, which is why this takes no hint -- see the header for when that stops being true. */
jsrt_value jsrt_to_primitive(jsrt_value v) {
  return jsrt_is_object(v) ? jsrt_to_string(v) : v;
}

/* ============================================================================
 * Addition operator (+) — ECMA-262 §12.8.3
 * ============================================================================ */

jsrt_value jsrt_op_add(jsrt_value a, jsrt_value b) {
  /* ToPrimitive BOTH, THEN ask about strings. The order is the whole operator: `[1] + [2]` is
   * "12" because the arrays become strings before the test, not after -- test first and both
   * become NaN instead. NUMERIC.md §7 names this as the easy thing to get backwards. */
  jsrt_value pa = jsrt_to_primitive(a);
  jsrt_value pb = jsrt_to_primitive(b);

  /* If EITHER operand is a string, ToString both and concatenate. */
  if (jsrt_is(pa, JSRT_TAG_STRING) || jsrt_is(pb, JSRT_TAG_STRING)) {
    jsrt_value sa = jsrt_to_string(pa);
    jsrt_value sb = jsrt_to_string(pb);
    return jsrt_string_concat(sa, sb);
  }

  /* Otherwise, ToNumber both and add. */
  double da = jsrt_to_number(pa);
  double db = jsrt_to_number(pb);
  return jsrt_number(da + db);
}

/* ============================================================================
 * Relational comparison operators — ECMA-262 §12.10
 * ============================================================================ */

/* Abstract Relational Comparison answers less-than, greater-than, equal, or UNDEFINED, and each
 * of the four operators maps undefined to false. Modelling that fourth outcome explicitly is what
 * keeps the NaN rule honest: `a <= b` is NOT `!(a > b)`, because NaN makes both false at once.
 * Written once here so the four operators cannot drift apart. */
typedef enum {
  JSRT_ORDER_LT,
  JSRT_ORDER_EQ,
  JSRT_ORDER_GT,
  JSRT_ORDER_UNORDERED /* at least one operand is NaN */
} jsrt_order;

static jsrt_order jsrt_compare(jsrt_value a, jsrt_value b) {
  /* ToPrimitive first, for the same reason as `+`: the both-strings test has to see what the
   * operands BECOME, so `["10"] < ["9"]` compares text and answers true. */
  jsrt_value pa = jsrt_to_primitive(a);
  jsrt_value pb = jsrt_to_primitive(b);

  /* Text order applies only when BOTH operands are strings. One non-string operand sends both
   * through ToNumber -- which is why `"10" < "9"` is true but `"10" < 9` is false. */
  if (jsrt_is(pa, JSRT_TAG_STRING) && jsrt_is(pb, JSRT_TAG_STRING)) {
    int c = jsrt_string_compare(pa, pb);
    if (c < 0) {
      return JSRT_ORDER_LT;
    }
    return c > 0 ? JSRT_ORDER_GT : JSRT_ORDER_EQ;
  }

  double da = jsrt_to_number(pa);
  double db = jsrt_to_number(pb);
  if (isnan(da) || isnan(db)) {
    return JSRT_ORDER_UNORDERED;
  }
  if (da < db) {
    return JSRT_ORDER_LT;
  }
  return da > db ? JSRT_ORDER_GT : JSRT_ORDER_EQ;
}

bool jsrt_op_lt(jsrt_value a, jsrt_value b) { return jsrt_compare(a, b) == JSRT_ORDER_LT; }

bool jsrt_op_gt(jsrt_value a, jsrt_value b) { return jsrt_compare(a, b) == JSRT_ORDER_GT; }

bool jsrt_op_le(jsrt_value a, jsrt_value b) {
  jsrt_order o = jsrt_compare(a, b);
  return o == JSRT_ORDER_LT || o == JSRT_ORDER_EQ;
}

bool jsrt_op_ge(jsrt_value a, jsrt_value b) {
  jsrt_order o = jsrt_compare(a, b);
  return o == JSRT_ORDER_GT || o == JSRT_ORDER_EQ;
}
