import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { emitC } from '../../src/codegen/index.ts';
import { H_BOOLEAN, H_NUMBER, H_STRING } from '../../src/hir/types.ts';
import {
  assign,
  binary,
  block,
  bool,
  call,
  consoleLog,
  decl,
  exprStmt,
  fnDecl,
  id,
  ifStmt,
  makeModule,
  num,
  ret,
  str,
  whileStmt,
} from './helpers.ts';

void test('prologue includes jsrt_init and the globals frame', () => {
  const module = makeModule([]);
  const c = emitC(module);

  assert.match(c, /#include "jsrt_value.h"/);
  assert.match(c, /int main\(void\)/);
  assert.match(c, /jsrt_init\(\);/);
  // A zero-length array is not valid C11, and a program with no module-level binding is.
  assert.match(c, /JSRT_GLOBALS\(1\);/);
  assert.match(c, /JSRT_GLOBALS_ENTER\(1\);/);
  assert.match(c, /return 0;/);
});

void test('console.log(1 + 2 * 3) emits correct calls', () => {
  const module = makeModule([
    exprStmt(consoleLog([binary('+', num(1), binary('*', num(2), num(3)))]), H_NUMBER),
  ]);

  const c = emitC(module);

  // Must use jsrt_print, not plain printf
  assert.match(c, /jsrt_print/);
  // Must use jsrt_number for number literals
  assert.match(c, /jsrt_number/);
  // Must not have raw == comparisons of jsrt_values
  assert.ok(!c.includes(' == ') || c.includes('jsrt_strict_equals'));
});

void test('=== operator uses jsrt_strict_equals', () => {
  const module = makeModule([exprStmt(binary('===', num(1), num(1), H_BOOLEAN), H_BOOLEAN)]);

  const c = emitC(module);
  assert.match(c, /jsrt_strict_equals/);
});

void test('!== operator uses jsrt_strict_equals with negation', () => {
  const module = makeModule([exprStmt(binary('!==', num(1), num(2), H_BOOLEAN), H_BOOLEAN)]);

  const c = emitC(module);
  assert.match(c, /jsrt_strict_equals/);
  assert.match(c, /!\s*jsrt_strict_equals/);
});

void test('#line directives appear with correct line numbers', () => {
  const module = makeModule([decl('x', num(42, 5), 'let', H_NUMBER, 5)]);

  const c = emitC(module);
  assert.match(c, /#line 5 "\/test\.ts"/);
});

void test('#line directives escape backslashes in filenames', () => {
  const module = makeModule([decl('x', num(1), 'let')]);
  // Override fileName to test backslash escaping
  const backslashModule = {
    ...module,
    fileName: '/path\\with\\backslash.ts',
  };

  const c = emitC(backslashModule);
  assert.match(c, /#line 1 "\/path\\\\with\\\\backslash\.ts"/);
});

void test('slot allocation for declarations', () => {
  const module = makeModule([
    decl('x', num(1), 'let', H_NUMBER, 1),
    decl('y', num(2), 'let', H_NUMBER, 2),
  ]);

  const c = emitC(module);

  assert.match(c, /JSRT_GLOBALS\(2\);/);

  // Both x (slot 0) and y (slot 1) should be assigned
  assert.match(c, /JSRT_GLOBAL\(0\)/);
  assert.match(c, /JSRT_GLOBAL\(1\)/);
});

void test('arithmetic operators convert with jsrt_to_number and rewrap with jsrt_number', () => {
  // `-` and not `+`: `+` concatenates when given a string, so it dispatches in the runtime and
  // emits no conversion of its own. The other four are numeric unconditionally.
  const module = makeModule([exprStmt(binary('-', num(1), num(2)), H_NUMBER)]);

  const c = emitC(module);

  // ToNumber, NOT jsrt_to_double: the latter reinterprets the bits as an IEEE double, which is
  // only correct when the value already is one. On a boxed boolean or string it reads the tag
  // and payload as a mantissa and yields garbage.
  assert.match(c, /jsrt_to_number/);
  assert.doesNotMatch(c, /jsrt_to_double/);
  // Must use jsrt_number to rewrap result
  assert.match(c, /jsrt_number/);
});

void test('+ dispatches to the runtime, because a string operand makes it concatenation', () => {
  const module = makeModule([exprStmt(binary('+', num(1), num(2)), H_NUMBER)]);

  const c = emitC(module);

  assert.match(c, /jsrt_op_add/);
  // The emitter must NOT decide this is addition: whether `+` adds or concatenates depends on the
  // runtime types of the operands, which are not known here.
  assert.doesNotMatch(c, /jsrt_to_number\(.*\) \+ /);
});

void test('string literals use jsrt_string_from_utf8 with byte length', () => {
  const module = makeModule([decl('s', str('hello'), 'const', H_STRING)]);

  const c = emitC(module);

  assert.match(c, /jsrt_string_from_utf8\("hello", 5\)/);
});

// Conditions run ToBoolean, not `jsrt_as_bool`. `jsrt_as_bool` reads bit 0 of the value, which
// is the payload only for a boxed boolean; for a boxed double it is a mantissa bit, so `if (1)`
// took the ELSE branch while these tests asserted the old spelling.
void test('if statement uses jsrt_truthy on condition', () => {
  const module = makeModule([ifStmt(bool(true), block([]), undefined, H_NUMBER)]);

  const c = emitC(module);
  assert.match(c, /if \(jsrt_truthy/);
  assert.doesNotMatch(c, /jsrt_as_bool/);
});

void test('while statement uses jsrt_truthy on condition', () => {
  const module = makeModule([whileStmt(bool(true), block([]), H_NUMBER)]);

  const c = emitC(module);
  assert.match(c, /while \(jsrt_truthy/);
  assert.doesNotMatch(c, /jsrt_as_bool/);
});

void test('main does not pop the globals frame, but an emitted function pops its own', () => {
  // The globals frame is pushed once and outlives every call, because a function body may read a
  // module-level binding. Popping it in main would unroot values still reachable from a callee.
  const mainOnly = emitC(makeModule([decl('x', num(1), 'let')]));
  assert.ok(!mainOnly.includes('JSRT_FRAME_POP()'), 'main must not pop the globals frame');
  assert.match(mainOnly, /return 0;/);

  // A function frame is the opposite: it must pop on every exit path, the explicit return
  // included, and the value has to be read out of a rooted slot before the pop happens.
  const withFn = emitC(makeModule([fnDecl('f', ['n'], block([ret(id('n', H_NUMBER))]))]));
  assert.match(withFn, /JSRT_FRAME\(\d+\);/);
  assert.match(withFn, /JSRT_LOCAL\(\d+\) = .*\), JSRT_FRAME_POP\(\), JSRT_LOCAL\(\d+\)\);/);
});

void test('a call dispatches to jsrt_call with its own argc, and passes NULL when there are none', () => {
  // argc is the CALL SITE's argument count, not the callee's declared arity: JavaScript drops
  // extras and fills missing parameters with undefined, so the emitter must not pad or truncate
  // to match the function it thinks it is calling (docs/HIR.md, HFunction).
  const declareF = fnDecl('f', [], block([]));

  const noArgs = emitC(makeModule([declareF, exprStmt(call(id('f', H_NUMBER)), H_NUMBER)]));
  assert.match(noArgs, /jsrt_call\([^,]+, 0, NULL\)/);

  // With arguments, argv points into the rooted slot run rather than at a C array literal, whose
  // storage the collector would not know about.
  const twoArgs = emitC(
    makeModule([declareF, exprStmt(call(id('f', H_NUMBER), [num(1), num(2)]), H_NUMBER)]),
  );
  assert.match(twoArgs, /jsrt_call\([^,]+, 2, &/);
  assert.doesNotMatch(twoArgs, /jsrt_call\([^,]+, 2, \(jsrt_value\[\]\)/);
});

void test('a call evaluates arguments left to right, and dispatches only once all are rooted', () => {
  // C leaves argument evaluation order unspecified, so the emitter imposes the language's order
  // itself. Distinctive literals make the emitted positions readable without pinning how any
  // individual operand is spelled.
  const c = emitC(
    makeModule([
      fnDecl('callee', [], block([])),
      exprStmt(call(id('callee', H_NUMBER), [num(111), num(222)]), H_NUMBER),
    ]),
  );

  const firstArg = c.indexOf('111');
  const secondArg = c.indexOf('222');
  const dispatch = c.indexOf('jsrt_call');

  assert.ok(firstArg > -1 && secondArg > -1 && dispatch > -1, 'all three must appear');
  assert.ok(firstArg < secondArg, 'arguments are evaluated left to right');
  // Every operand is written to its rooted slot before the call happens; a collection triggered
  // inside a later argument must not be able to sweep an earlier one.
  assert.ok(secondArg < dispatch, 'dispatch comes after every argument is evaluated and rooted');
});

void test('console.log with more than one argument throws', () => {
  const module = makeModule([exprStmt(consoleLog([num(1), num(2)]), H_NUMBER)]);

  assert.throws(() => emitC(module), /console.log requires exactly 1 argument/);
});

void test('relational operators dispatch to the runtime and wrap in jsrt_bool', () => {
  const module = makeModule([exprStmt(binary('<', num(1), num(2), H_BOOLEAN), H_BOOLEAN)]);

  const c = emitC(module);

  // Text order vs numeric order is a runtime decision -- `"10" < "9"` is true while `"10" < 9`
  // is false -- so the emitter names the operation and does not inline a C comparison.
  assert.match(c, /jsrt_bool\(jsrt_op_lt\(/);
});

void test('boolean literals emit jsrt_bool(true) or jsrt_bool(false)', () => {
  const moduleTrue = makeModule([exprStmt(bool(true), H_BOOLEAN)]);

  const cTrue = emitC(moduleTrue);
  assert.match(cTrue, /jsrt_bool\(true\)/);

  const moduleFalse = makeModule([exprStmt(bool(false), H_BOOLEAN)]);

  const cFalse = emitC(moduleFalse);
  assert.match(cFalse, /jsrt_bool\(false\)/);
});

void test('assignment updates correct slot', () => {
  const module = makeModule([
    decl('x', num(1), 'let', H_NUMBER, 1),
    assign('x', num(2), H_NUMBER, 2),
  ]);

  const c = emitC(module);

  assert.match(c, /JSRT_GLOBALS\(1\);/);

  // Both declaration and assignment should use JSRT_GLOBAL(0)
  const matches = c.match(/JSRT_GLOBAL\(0\)/g);
  assert.ok(matches && matches.length >= 2, 'x should be declared and assigned in slot 0');
});

void test('modulo operator uses fmod', () => {
  const module = makeModule([exprStmt(binary('%', num(10), num(3)), H_NUMBER)]);

  const c = emitC(module);
  assert.match(c, /fmod/);
});

void test('string escaping handles special characters', () => {
  const module = makeModule([
    decl('s', str('line1\nline2\ttab"quote\\backslash'), 'const', H_STRING),
  ]);

  const c = emitC(module);

  // Check for proper escaping in the C output
  assert.match(c, /line1\\nline2\\ttab\\"quote\\\\backslash/);
});

void test('identifier reference uses allocated slot', () => {
  const module = makeModule([
    decl('x', num(5), 'let', H_NUMBER, 1),
    decl('y', id('x', H_NUMBER, 2), 'let', H_NUMBER, 2),
  ]);

  const c = emitC(module);

  // x should be in slot 0, y in slot 1
  // The second declaration should reference JSRT_LOCAL(0)
  assert.match(c, /JSRT_GLOBALS\(2\);/);
  const lines = c.split('\n');
  let foundYDecl = false;
  for (const line of lines) {
    if (line.includes('JSRT_GLOBAL(1)') && line.includes('JSRT_GLOBAL(0)')) {
      foundYDecl = true;
    }
  }
  assert.ok(foundYDecl, 'y declaration should reference x via slot 0');
});

void test('binary operands are sequenced into rooted slots before the operation', () => {
  const c = emitC(
    makeModule([
      fnDecl('f', ['n'], block([ret(id('n', H_NUMBER))])),
      exprStmt(
        binary(
          '+',
          call(id('f', H_NUMBER), [num(111)]),
          call(id('f', H_NUMBER), [num(222)]),
          H_NUMBER,
        ),
        H_NUMBER,
      ),
    ]),
  );

  // C function argument order is unspecified. The two calls must instead be placed in comma-
  // sequenced rooted slots, and the final operation must consume only those slots.
  const first = c.indexOf('jsrt_number(111.0)');
  const second = c.indexOf('jsrt_number(222.0)');
  const operation = c.lastIndexOf('jsrt_op_add(');
  assert.ok(first > -1 && second > -1 && operation > -1, 'both operands and the operation exist');
  assert.ok(
    first < second && second < operation,
    'left operand, then right operand, then operator',
  );
  assert.doesNotMatch(c, /jsrt_op_add\(\(JSRT_(?:GLOBAL|LOCAL).*jsrt_call/);
});
