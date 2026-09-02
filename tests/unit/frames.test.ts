/* The shadow-frame audit (plan.md §7 Task 4.5): the emitted C is diffed against itself.
 *
 * `JSRT_FRAME(n)` declares n rooted slots and is written ONCE, at the top of a function, before a
 * line of the body exists — so n is decided by a counting pass and the body is emitted against
 * whatever that pass decided. Nothing in the C compiler checks the two agree. Under Boehm they can
 * disagree for a long time without a symptom: the collector scans the stack conservatively and
 * finds the value anyway. It stops being invisible when §12's precise GC lands, which is exactly
 * the moment the discipline exists to survive (docs/VALUE.md §4, AGENTS.md).
 *
 * So this test reads the generated C for every golden fixture and holds it to three invariants:
 *
 *   1. Every `JSRT_LOCAL(i)` a function emits is inside its own frame. A slot past the end is a
 *      buffer overrun on the C stack — the one failure here that is memory corruption, not waste.
 *   2. The slots a function uses are exactly 0..n-1, with a floor of one slot for a function that
 *      roots nothing (a zero-length array is not valid C11). A gap is a slot the frame roots and
 *      nothing writes; it is harmless today and is how a counting pass drifts out of step with the
 *      emitter it is supposed to describe.
 *   3. Every path leaving a framed function pops it — every `return`, and the fallthrough. A
 *      missed pop leaves `jsrt_frame_top` pointing at dead stack.
 *
 * The corpus is the golden fixtures rather than hand-built HIR: they are the programs whose OUTPUT
 * is already proven against Node, so a frame bug found here is a frame bug in code that runs.
 */
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitC } from '../../src/codegen/index.ts';
import { lowerSource } from './helpers.ts';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'ts');

interface EmittedFunction {
  readonly name: string;
  readonly body: string;
}

/* Splits the emitted C into function bodies. Parsing C in general is not on the table; parsing
 * THIS C is, because we wrote it: every function opens at column zero and its closing brace is the
 * only `}` at column zero, everything inside being indented. */
function functionsIn(c: string): EmittedFunction[] {
  const found: EmittedFunction[] = [];
  let open: string | null = null;
  let body: string[] = [];
  for (const line of c.split('\n')) {
    if (open === null) {
      const start = /^(?:static jsrt_value (_jsrt_fn_\d+)\(uint32_t|(int main)\(void\))/.exec(line);
      if (start !== null && line.endsWith('{')) {
        open = start[1] ?? 'main';
        body = [];
      }
      continue;
    }
    if (line === '}') {
      found.push({ name: open, body: body.join('\n') });
      open = null;
      continue;
    }
    body.push(line);
  }
  assert.equal(open, null, 'a function body was never closed');
  return found;
}

function indices(body: string, macro: string): number[] {
  return [...body.matchAll(new RegExp(`${macro}\\((\\d+)\\)`, 'g'))].map((m) => Number(m[1]));
}

/* The one slot the counting pass MUST reserve without knowing whether it will be written: a
 * try/finally's exception stash. Whether the finally can be entered by a throw is decided while
 * EMITTING the try body — a label is marked used or it is not — which is long after JSRT_FRAME(n)
 * has to be final. Predicting it at counting time would mean a second copy of the unwind analysis
 * drifting from the first, which is the failure this test exists to catch. So it is counted here
 * instead: one allowance per finally whose throw path never armed. */
function conservativeSlots(body: string): number {
  const finallies = (body.match(/^\s*_jsrt_fin_\d+: ;$/gm) ?? []).length;
  const armed = (body.match(/^\s*_jsrt_finthr_\d+: ;$/gm) ?? []).length;
  return finallies - armed;
}

/** Every fixture that lowers on its own — the multi-file ones are directories and the class-heavy
 * ones need the whole-program path this helper does not take; what is left is still 40+ programs
 * covering closures, exceptions, loops, generics and every builtin family. */
function corpus(): { name: string; c: string }[] {
  const out: { name: string; c: string }[] = [];
  for (const name of readdirSync(GOLDEN).sort()) {
    const path = join(GOLDEN, name);
    if (!name.endsWith('.ts') || statSync(path).isDirectory()) {
      continue;
    }
    try {
      out.push({ name, c: emitC(lowerSource(readFileSync(path, 'utf8')).module) });
    } catch {}
  }
  assert.ok(out.length > 20, `expected the golden corpus, got ${String(out.length)} fixtures`);
  return out;
}

const EMITTED = corpus();

void test('every emitted slot is inside the frame that roots it', () => {
  for (const { name, c } of EMITTED) {
    for (const fn of functionsIn(c)) {
      const frame = /JSRT_FRAME\((\d+)\)/.exec(fn.body);
      const used = indices(fn.body, 'JSRT_LOCAL');
      if (frame === null) {
        assert.deepEqual(used, [], `${name}:${fn.name} uses JSRT_LOCAL without a frame`);
        continue;
      }
      const size = Number(frame[1]);
      for (const slot of used) {
        assert.ok(
          slot < size,
          `${name}:${fn.name} writes JSRT_LOCAL(${String(slot)}) into a frame of ${String(size)}`,
        );
      }
    }
  }
});

void test('a frame is exactly as large as the locals it roots', () => {
  for (const { name, c } of EMITTED) {
    for (const fn of functionsIn(c)) {
      const frame = /JSRT_FRAME\((\d+)\)/.exec(fn.body);
      if (frame === null) {
        continue;
      }
      const size = Number(frame[1]);
      const used = new Set(indices(fn.body, 'JSRT_LOCAL'));
      if (used.size === 0) {
        // The floor: a function that roots nothing still declares one slot, because C11 has no
        // zero-length array — the same rule JSRT_GLOBALS(n) follows.
        assert.equal(size, 1, `${name}:${fn.name} declares ${String(size)} slots and roots none`);
        continue;
      }
      // Every unwritten slot beyond the try/finally allowance is a bug.
      const unwritten = [...Array(size).keys()].filter((slot) => !used.has(slot));
      assert.equal(
        unwritten.length,
        conservativeSlots(fn.body),
        `${name}:${fn.name} roots slots [${unwritten.join(', ')}] that nothing writes`,
      );
    }
  }
});

void test('the module frame is exactly as large as the globals it roots', () => {
  for (const { name, c } of EMITTED) {
    // An async module keeps named bindings in the globals array and temps in a heap environment
    // (Phase 5 step 9). Slot accounting is not "every declared global is written in main".
    if (c.includes('jsrt_async_start')) {
      continue;
    }
    const declared = [...c.matchAll(/JSRT_GLOBALS(?:_ENTER)?\((\d+)\)/g)].map((m) => Number(m[1]));
    // Declared once and entered once, with the same count: two macros, one array.
    assert.equal(declared.length, 2, `${name} declares ${String(declared.length)} globals frames`);
    assert.equal(declared[0], declared[1], `${name} enters a globals frame of a different size`);
    // Globals are read from every function, so the used set is the whole file's; the allowance is
    // main's, because a module-level try/finally stashes its exception in a global.
    const size = declared[0] ?? 0;
    const used = new Set(indices(c, 'JSRT_GLOBAL'));
    if (used.size === 0) {
      assert.equal(size, 1, `${name} declares ${String(size)} globals and roots none`);
      continue;
    }
    const main = functionsIn(c).find((fn) => fn.name === 'main');
    assert.ok(main !== undefined, `${name} emits no main`);
    const unwritten = [...Array(size).keys()].filter((slot) => !used.has(slot));
    assert.equal(
      unwritten.length,
      conservativeSlots(main.body),
      `${name} roots globals [${unwritten.join(', ')}] that nothing writes`,
    );
  }
});

void test('every path out of a framed function pops its frame', () => {
  for (const { name, c } of EMITTED) {
    for (const fn of functionsIn(c)) {
      if (!fn.body.includes('JSRT_FRAME(')) {
        continue;
      }
      // `#line` directives and blank lines are not statements; dropping them is what makes "the
      // pop is right before the return" a statement about the CODE rather than about formatting.
      const lines = fn.body
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#line'));
      for (const [at, line] of lines.entries()) {
        if (!line.startsWith('return')) {
          continue;
        }
        const popped = line.includes('JSRT_FRAME_POP()') || lines[at - 1] === 'JSRT_FRAME_POP();';
        assert.ok(popped, `${name}:${fn.name} returns without popping: ${line}`);
      }
    }
  }
});
