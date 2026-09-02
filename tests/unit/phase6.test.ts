import { strict as assert } from 'node:assert';
import test from 'node:test';
import { generateProgram, XorShift32 } from '../differential/generate.ts';
import { minimizeProgram } from '../differential/minimize.ts';
import { featureStatus } from '../test262/features.ts';
import { parseFrontmatter } from '../test262/run.ts';

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
