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

test('Test262 frontmatter accepts the fixed subset and rejects unknown keys', () => {
  const metadata = parseFrontmatter(
    [
      '/*---',
      'features:',
      '  - Array',
      'includes: [compareArray.js]',
      'flags: [raw]',
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
  assert.deepEqual(metadata.negative, { phase: 'parse', type: 'SyntaxError' });
  assert.throws(
    () => parseFrontmatter('/*---\nunknown: true\n---*/', 'bad.js'),
    /unknown frontmatter key/,
  );
});

test('Test262 feature mapping is explicit', () => {
  assert.equal(featureStatus('Array')?.kind, 'supported');
  assert.equal(featureStatus('BigInt')?.kind, 'not-yet');
  assert.equal(featureStatus('made-up-tag'), undefined);
});
