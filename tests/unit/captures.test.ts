/* src/lower/captures.ts decides, for every function, which of its own bindings must move to a heap
 * environment and where each free variable lives on the environment chain. Nothing downstream can
 * catch an error here: a wrong `levels` or `index` produces a program that compiles, links, and
 * silently reads the wrong slot. The golden fixtures observe the end result; these tests pin the
 * analysis itself, including the two cases with no visible spelling — an intermediate function that
 * captures nothing but must still carry the chain, and a module-level binding that is never a
 * capture at all because the globals array already reaches it. */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as ts from 'typescript';
import type { CaptureInfo, CaptureMap, FunctionLike } from '../../src/lower/captures.ts';
import { analyzeCaptures } from '../../src/lower/captures.ts';
import { createProgram } from './helpers.ts';

/** Analyze `source` and key the result by a readable name: a function declaration's own name, or,
 * for a function expression or arrow, the variable it is assigned to. */
function analyze(source: string): {
  named: Map<string, CaptureInfo>;
  raw: CaptureMap;
} {
  const { program, sourceFile } = createProgram(source);
  const raw = analyzeCaptures(sourceFile, program.getTypeChecker());
  const named = new Map<string, CaptureInfo>();
  for (const [fn, info] of raw) {
    const name = nameOf(fn);
    if (name !== undefined) {
      named.set(name, info);
    }
  }
  return { named, raw };
}

function nameOf(fn: FunctionLike): string | undefined {
  const own = ts.isArrowFunction(fn) || ts.isConstructorDeclaration(fn) ? undefined : fn.name;
  if (own !== undefined && ts.isIdentifier(own)) {
    return own.text;
  }
  const parent = fn.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return undefined;
}

function get(named: Map<string, CaptureInfo>, name: string): CaptureInfo {
  const info = named.get(name);
  if (info === undefined) {
    throw new Error(`no capture info recorded for ${name}`);
  }
  return info;
}

void test('a function nothing reads into needs no environment at all', () => {
  const { named } = analyze(`
    function alone(): number {
      const x: number = 1;
      return x;
    }
    console.log(alone());
  `);
  const alone = get(named, 'alone');
  assert.deepEqual(alone.envVars, []);
  assert.deepEqual(alone.captures, []);
  assert.equal(alone.needsEnv, false);
});

void test('a read from a nested function moves the binding into the declaring environment', () => {
  const { named } = analyze(`
    function outer(): () => number {
      let n: number = 0;
      return function (): number {
        n = n + 1;
        return n;
      };
    }
    console.log(outer()());
  `);
  const outer = get(named, 'outer');
  assert.deepEqual(outer.envVars, ['n']);
  // The declaring function reaches `n` through the environment it allocates itself, so it needs no
  // INCOMING one on this account -- that distinction is what keeps `outer`'s own closure static.
  assert.equal(outer.needsEnv, false);
  assert.deepEqual(outer.captures, []);
});

void test('a captured parameter is held in the environment exactly like a captured local', () => {
  const { named } = analyze(`
    function adder(base: number): (x: number) => number {
      return function (x: number): number {
        return base + x;
      };
    }
    console.log(adder(1)(2));
  `);
  assert.deepEqual(get(named, 'adder').envVars, ['base']);
});

void test('an intermediate function that captures nothing still carries the chain', () => {
  const { named, raw } = analyze(`
    function outer(): () => number {
      const tag: number = 7;
      function middle(): () => number {
        return function (): number {
          return tag;
        };
      }
      return middle();
    }
    console.log(outer()());
  `);
  const middle = get(named, 'middle');
  assert.deepEqual(middle.envVars, [], 'middle owns no captured binding');
  assert.deepEqual(middle.captures, [], 'middle reads nothing itself');
  assert.equal(middle.needsEnv, true, 'but the chain runs through it, so it must take an env');

  // The chain counts env-BEARING scopes only, so the env-less `middle` adds no level: the innermost
  // function finds `tag` at level 0, the same place it would sit without `middle` in between.
  const inner = [...raw.values()].find((info) => info.captures.some((c) => c.name === 'tag'));
  assert.notEqual(inner, undefined);
  assert.deepEqual(inner?.captures, [{ name: 'tag', levels: 0, index: 0 }]);
});

void test('each env-bearing scope crossed adds exactly one level', () => {
  const { raw } = analyze(`
    function a(): number {
      const outerVar: number = 1;
      function b(): number {
        const innerVar: number = 2;
        function c(): number {
          return outerVar + innerVar;
        }
        return c();
      }
      return b();
    }
    console.log(a());
  `);
  const c = [...raw.values()].find((info) => info.captures.length === 2);
  assert.notEqual(c, undefined);
  const byName = new Map(c?.captures.map((cap) => [cap.name, cap.levels]));
  // `b` bears an environment (it holds innerVar), so reaching past it to `a` costs a level.
  assert.equal(byName.get('innerVar'), 0);
  assert.equal(byName.get('outerVar'), 1);
});

void test('every capture index addresses the named slot in the owning environment', () => {
  const { named, raw } = analyze(`
    function owner(): number {
      const zebra: number = 1;
      const apple: number = 2;
      const mango: number = 3;
      function reader(): number {
        return zebra + apple + mango;
      }
      return reader();
    }
    console.log(owner());
  `);
  const env = get(named, 'owner').envVars;
  assert.equal(env.length, 3);
  assert.equal(new Set(env).size, 3, 'no two bindings share a slot');
  for (const capture of get(named, 'reader').captures) {
    assert.equal(capture.levels, 0);
    assert.equal(
      env[capture.index],
      capture.name,
      `capture ${capture.name} points at slot ${String(capture.index)}`,
    );
  }
  // Layout must not depend on the order the walk met the references, or two compilations of the
  // same source would disagree about which slot holds what.
  const again = analyze(`
    function owner(): number {
      const zebra: number = 1;
      const apple: number = 2;
      const mango: number = 3;
      function reader(): number {
        return mango + apple + zebra;
      }
      return reader();
    }
    console.log(owner());
  `);
  assert.deepEqual(get(again.named, 'owner').envVars, env);
  assert.equal(raw.size, again.raw.size);
});

void test('a module-level binding is never a capture -- the globals array already reaches it', () => {
  const { named } = analyze(`
    const top: number = 5;
    function reader(): number {
      return top;
    }
    console.log(reader());
  `);
  const reader = get(named, 'reader');
  assert.deepEqual(reader.captures, []);
  assert.equal(reader.needsEnv, false);
});

void test('a function referring only to itself recurses without an environment', () => {
  const { named } = analyze(`
    function fact(n: number): number {
      if (n < 2) {
        return 1;
      }
      return n * fact(n - 1);
    }
    console.log(fact(5));
  `);
  const fact = get(named, 'fact');
  assert.deepEqual(fact.envVars, []);
  assert.deepEqual(fact.captures, []);
  assert.equal(fact.needsEnv, false);
});
