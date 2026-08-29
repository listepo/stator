/* Const-folding (plan.md §5 Task 3.6) — compute at compile time what the program cannot observe
 * being computed at run time.
 *
 * The pass rests on one restriction, and the restriction is what makes it safe rather than clever:
 * **an operation folds only when every operand is already a LITERAL node.** Not "is provably
 * constant", not "is a `const` nobody reassigns" — a literal, present in the tree.
 *
 * That satisfies the `Unknown`-preservation rule (docs/HIR.md §3.2) by construction rather than by
 * a check someone could forget: a literal is never `Unknown`, so no fold can elide a boundary check
 * or hand downstream a narrowing nothing proved. It also makes side effects a non-question — a
 * literal calls nothing, allocates nothing and reads nothing, so deleting one deletes no observable
 * behaviour, where `f() + 0` looks foldable and is not.
 *
 * The evaluator is JavaScript's own: `1 / 3` folds by asking Node to compute `1 / 3`. The compiler
 * runs on the same pinned Node the golden tests diff against, so a folded expression and an
 * unfolded one cannot disagree about `-0`, NaN, or the seventeenth digit — which they certainly
 * would if this file reimplemented ECMA-262 §6.1.6. What IS decided here is only which operations
 * may be folded at all.
 *
 * Folding runs bottom-up (rewrite.ts), so `1 + 2 + 3` folds in a single pass: the inner `+` is
 * already a literal by the time the outer one is offered.
 */

import type { BinaryOperator, Expression, Module, UnaryOp } from '../hir/nodes.ts';
import type { HType } from '../hir/types.ts';
import { H_BOOLEAN, H_NUMBER, H_STRING, hTypeEquals } from '../hir/types.ts';
import { rewriteModule } from './rewrite.ts';

export function constFold(module: Module): Module {
  return rewriteModule(module, { expression: fold });
}

/** The values a literal node can carry — the whole domain this pass ever evaluates over. Crucially
 * it contains no object, so none of the operators below can reach a `valueOf`/`toString` that the
 * program would have observed being called. */
type Literal = number | string | boolean | null | undefined;

/** The value of a literal node, or `undefined` for anything else — including a `const` whose
 * initializer was a literal, because this pass tracks no bindings. Wrapped in a box so that
 * `undefined` the VALUE (`undefined-literal`) stays distinguishable from `undefined` the answer
 * "not a literal". */
function literalValue(expr: Expression): { readonly value: Literal } | undefined {
  switch (expr.kind) {
    case 'number-literal':
    case 'string-literal':
    case 'boolean-literal':
      return { value: expr.value };
    case 'null-literal':
      return { value: null };
    case 'undefined-literal':
      return { value: undefined };
    default:
      return undefined;
  }
}

/** A literal node carrying `value`, or `null` when the HIR has none for it.
 *
 * `expected` is the type the node being replaced carried, and a mismatch REFUSES the fold. That is
 * not caution about arithmetic; it is what stops a fold from changing a node's type underneath the
 * verifier, which would convert a wrong constant into an internal error one pass later instead of a
 * wrong answer at run time. It can only fire when the lowering and the language disagree about an
 * operator's result type — exactly the bug worth catching rather than papering over. */
function literalNode(value: Literal, expected: HType, span: Expression['span']): Expression | null {
  if (typeof value === 'number' && hTypeEquals(expected, H_NUMBER)) {
    return { kind: 'number-literal', type: H_NUMBER, span, value };
  }
  if (typeof value === 'string' && hTypeEquals(expected, H_STRING)) {
    return { kind: 'string-literal', type: H_STRING, span, value };
  }
  if (typeof value === 'boolean' && hTypeEquals(expected, H_BOOLEAN)) {
    return { kind: 'boolean-literal', type: H_BOOLEAN, span, value };
  }
  return null;
}

/* Every operand here came from a literal node, so JavaScript's own operator is total over it and
 * runs no user-visible step. TypeScript's operator TYPING is narrower than the language — it has no
 * way to express "whatever `+` does to two primitives" — so each operand is cast at the point of
 * use. The casts are erased; what actually executes is the language's operator, which is the whole
 * point of evaluating here rather than reimplementing the coercion tables. */
const n = (v: Literal): number => v as number;

/* One arm per operator, kept as one table on purpose: splitting it into arithmetic/relational/
 * bitwise helpers would hide that `+` is the only operator in it that is not numeric, which is the
 * one thing about this list a reader has to notice. */
function applyBinary(operator: BinaryOperator, left: Literal, right: Literal): Literal {
  switch (operator) {
    // `+` is the odd one: given a string operand it concatenates rather than adding.
    case '+':
      return (left as number) + (right as number);
    case '-':
      return n(left) - n(right);
    case '*':
      return n(left) * n(right);
    case '/':
      return n(left) / n(right);
    case '%':
      return n(left) % n(right);
    // Relational comparison, not arithmetic: two strings compare by code unit, and any NaN operand
    // makes all four false (docs/NUMERIC.md §6.1).
    case '<':
      return (left as number) < (right as number);
    case '>':
      return (left as number) > (right as number);
    case '<=':
      return (left as number) <= (right as number);
    case '>=':
      return (left as number) >= (right as number);
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    // Loose equality folds too, and correctly, for the same reason `+` does: with no object operand
    // the coercion table (docs/NUMERIC.md §6.3) has no observable steps to skip.
    case '==':
      // biome-ignore lint/suspicious/noDoubleEquals: modelling `==` is the point of this arm.
      return left == right;
    case '!=':
      // biome-ignore lint/suspicious/noDoubleEquals: modelling `!=` is the point of this arm.
      return left != right;
    case '&':
      return n(left) & n(right);
    case '|':
      return n(left) | n(right);
    case '^':
      return n(left) ^ n(right);
    case '<<':
      return n(left) << n(right);
    case '>>':
      return n(left) >> n(right);
    // `>>>` is the bitwise operator whose result can exceed int32 range, which is why the HIR types
    // every bitwise result `number` rather than growing an integer type (docs/NUMERIC.md §4).
    case '>>>':
      return n(left) >>> n(right);
  }
}

function applyUnary(operator: UnaryOp['operator'], operand: Literal): Literal {
  switch (operator) {
    // `-` is the only way to reach `-0` from `+0`, so it is computed, never treated as identity or
    // rewritten to `0 - x` (docs/NUMERIC.md §3.4).
    case '-':
      return -n(operand);
    case '+':
      return +n(operand);
    case '!':
      return !operand;
    case '~':
      return ~n(operand);
  }
}

/* The arms below ARE the specification of this pass: each names one operation that may be folded
 * and the condition under which folding it is not observable. Each is independent of the others, so
 * dispatching through a table would add a layer without removing a decision. */
function fold(expr: Expression): Expression {
  switch (expr.kind) {
    case 'binary-op': {
      const left = literalValue(expr.left);
      const right = literalValue(expr.right);
      if (left === undefined || right === undefined) {
        return expr;
      }
      const value = applyBinary(expr.operator, left.value, right.value);
      return literalNode(value, expr.type, expr.span) ?? expr;
    }

    case 'unary-op': {
      const operand = literalValue(expr.operand);
      if (operand === undefined) {
        return expr;
      }
      return literalNode(applyUnary(expr.operator, operand.value), expr.type, expr.span) ?? expr;
    }

    // `typeof` on a literal is decidable, and this is the one context in which folding it is not a
    // mistake: the operand is a literal NODE, not a value whose static type happens to say `number`
    // while an unchecked `unknown` sits underneath. That distinction is why the node exists.
    case 'typeof': {
      const operand = literalValue(expr.operand);
      return operand === undefined
        ? expr
        : (literalNode(typeof operand.value, expr.type, expr.span) ?? expr);
    }

    // The LEFT operand alone decides which side survives, so a literal left folds the whole node —
    // and this is the one fold that deletes an expression which may have had side effects, which is
    // exactly right: `false && f()` never calls `f` at run time either.
    case 'logical-op': {
      const left = literalValue(expr.left);
      if (left === undefined) {
        return expr;
      }
      const takesRight =
        expr.operator === '&&'
          ? Boolean(left.value)
          : expr.operator === '||'
            ? !left.value
            : left.value === null || left.value === undefined;
      const chosen = takesRight ? expr.right : expr.left;
      // The node's type can be wider than the surviving branch's — `1 || "s"` is `number | string`,
      // which is Unknown here — and replacing it would narrow the tree silently, which is the one
      // thing this pass must never do.
      return hTypeEquals(chosen.type, expr.type) ? chosen : expr;
    }

    // A template folds only when every hole does. Number-to-string here is JavaScript's own
    // conversion, which is the algorithm Ryū implements in the runtime, so a folded `${1 / 3}` and
    // an unfolded one print the same bytes (docs/VALUE.md §3).
    case 'template-literal': {
      const values = expr.expressions.map(literalValue);
      if (values.some((v) => v === undefined)) {
        return expr;
      }
      let text = expr.quasis[0] ?? '';
      for (const [i, value] of values.entries()) {
        text += String(value?.value) + (expr.quasis[i + 1] ?? '');
      }
      return literalNode(text, expr.type, expr.span) ?? expr;
    }

    // UTF-16 code units, matching jsrt_string_length: an astral character counts twice, and
    // JavaScript's own `.length` is that same count.
    case 'string-length': {
      const operand = literalValue(expr.operand);
      return typeof operand?.value === 'string'
        ? (literalNode(operand.value.length, expr.type, expr.span) ?? expr)
        : expr;
    }

    // Only when every element is a literal. `[f()].length` is 1, and folding it anyway would delete
    // the call — the one length in this pass that is not a property of the syntax alone.
    case 'array-length': {
      const target = expr.operand;
      return target.kind === 'array-literal' &&
        target.elements.every((e) => literalValue(e) !== undefined)
        ? (literalNode(target.elements.length, expr.type, expr.span) ?? expr)
        : expr;
    }

    default:
      return expr;
  }
}
