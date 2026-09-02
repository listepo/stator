import { strict as assert } from 'node:assert';
import test from 'node:test';
import { generateProgram, XorShift32 } from '../differential/generate.ts';
import { minimizeProgram } from '../differential/minimize.ts';
import { featureStatus } from '../test262/features.ts';
import { parseFrontmatter, scheduleSkipCode } from '../test262/run.ts';

test('differential generation is deterministic and mode-specific', () => {
  assert.equal(generateProgram(42, 'ts'), generateProgram(42, 'ts'));
  assert.notEqual(generateProgram(42, 'ts'), generateProgram(42, 'js'));
  assert.notEqual(new XorShift32(1).next(), new XorShift32(2).next());
  assert.match(generateProgram(42, 'ts'), /number\[\]/);
  assert.match(generateProgram(42, 'js'), /var n/);
});

test('differential minimizer preserves the reported predicate', () => {
  const source = 'const unused = 1;\nconsole.log(123);\n';
  const minimized = minimizeProgram(source, (candidate) => candidate.includes('console.log'));
  assert.match(minimized, /console\.log/);
  assert.ok(minimized.length < source.length);
});

test('Test262 frontmatter accepts standard headers after license comments and rejects unknown keys', () => {
  const metadata = parseFrontmatter(
    [
      '// Copyright Test262 contributors.',
      '',
      '/*---',
      'es5id: 15.4',
      ' description: >',
      '  A description may span several lines.',
      'info: |',
      '  An indented note may contain a colon: without becoming a key.',
      'author: Test262',
      'features:',
      '  - Array',
      'includes: [compareArray.js]',
      'flags: [raw]',
      'locale: [en, de]',
      'negative:',
      '  phase: parse',
      '  type: SyntaxError',
      '---*/',
      '',
    ].join('\n'),
    'sample.js',
  );
  assert.deepEqual(metadata.features, ['Array']);
  assert.deepEqual(metadata.includes, ['compareArray.js']);
  assert.deepEqual(metadata.locale, ['en', 'de']);
  assert.deepEqual(metadata.negative, { phase: 'parse', type: 'SyntaxError' });
  assert.throws(
    () => parseFrontmatter('/*---\nunknown: true\n---*/', 'bad.js'),
    /unknown frontmatter key/,
  );
});

test('Test262 counts a not-yet build as schedule, and anything else as a failure', () => {
  // §1.3 keeps the never and not-yet ranges disjoint so a test can tell intent from schedule; a
  // build the compiler declines to do YET is a skip attributed to that code, exactly as step 4
  // already treats a not-yet on a negative test.
  assert.equal(scheduleSkipCode('a.js:1:1 STA1214 [js] not yet'), 'STA1214');
  assert.equal(scheduleSkipCode('a.js:1:1 STA1216 x\na.js:2:1 STA1207 y'), 'STA1207');
  // One non-schedule code anywhere in the build makes the whole build a real refusal: the skip
  // bucket must not be able to swallow a checker error or a never diagnostic.
  assert.equal(scheduleSkipCode('a.js:1:1 STA1214 x\na.js:2:1 STA0012 y'), undefined);
  assert.equal(scheduleSkipCode('a.js:1:1 STA1101 [ts] eval is never supported'), undefined);
  assert.equal(scheduleSkipCode('clang: error: no such file'), undefined);
});

test('Test262 feature mapping is explicit', () => {
  assert.equal(featureStatus('Array')?.kind, 'supported');
  const bigInt = featureStatus('BigInt');
  assert.equal(bigInt?.kind, 'not-yet');
  assert.equal(bigInt?.kind === 'not-yet' ? bigInt.code : undefined, 'STA1213');
  assert.equal(featureStatus('ArrayBuffer')?.kind, 'not-yet');
  assert.equal(featureStatus('__proto__')?.kind, 'not-yet');
  const proxy = featureStatus('Proxy');
  assert.equal(proxy?.kind, 'not-yet');
  assert.equal(proxy?.kind === 'not-yet' ? proxy.code : undefined, 'STA1203');
  assert.equal(featureStatus('made-up-tag'), undefined);
});
