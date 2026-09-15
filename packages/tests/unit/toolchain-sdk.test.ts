/* The macOS SDK fallback's pure core (conda ld64-956 vs a newer Xcode SDK's `.tbd`).
 *
 * What is proved here, without touching a toolchain: the stale-linker signature matches
 * only the malformed/unknown-architecture `.tbd` failure (a missing `-lfoo` or a real
 * undefined symbol must surface unchanged); the fallback pick is the newest versioned
 * SDK whose `libSystem.tbd` carries no dotted `arm64e` sub-variant (bare `MacOSX.sdk`
 * is the sysroot that just failed, never a fallback; plain `arm64e` parses fine and
 * must not disqualify); and the filesystem half resolves against a test-double root.
 * `findFallbackSdk()` against the real CLT directory is deliberately NOT covered here:
 * it depends on host state, and the golden/ffi runs that link are its proof.
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  findFallbackSdk,
  isStaleLdSystemLibFailure,
  pickFallbackSdk,
  staleLdRetryArgs,
  tbdPathOf,
  type SdkCandidate,
} from '../../compiler/src/support/toolchain.ts';

const OLD_TBD = 'archs: [ arm64, arm64e, x86_64 ]\n';
const NEW_TBD = 'archs: [ arm64, arm64e.x1-macos, arm64e.x1-maccatalyst ]\n';

void test('stale-linker signature matches only the .tbd format failure', () => {
  assert.equal(
    isStaleLdSystemLibFailure(
      'ld: warning: ignoring file /MacOSX.sdk/usr/lib/libm.tbd, malformed file\n' +
        'libm.tbd:4:20: error: unknown architecture\n',
    ),
    true,
  );
  // A missing library names no `.tbd`: must NOT match, or every -lfoo typo would retry.
  assert.equal(
    isStaleLdSystemLibFailure('ld: library not found for -lfoo\nclang: error: linker failed\n'),
    false,
  );
  // A real undefined symbol after system libs linked fine: must NOT match either.
  assert.equal(
    isStaleLdSystemLibFailure(
      'Undefined symbols for architecture arm64:\n  "_jsrt_new", referenced from: _main\n',
    ),
    false,
  );
  // `.tbd` mentioned without the parser errors (e.g. a warning summary): no match.
  assert.equal(isStaleLdSystemLibFailure('note: using sysroot .tbd stub overlay\n'), false);
});

void test('fallback pick is the newest versioned SDK the old parser can read', () => {
  const candidates: readonly SdkCandidate[] = [
    { name: 'MacOSX.sdk', tbdText: OLD_TBD },
    { name: 'MacOSX26.5.sdk', tbdText: OLD_TBD },
    { name: 'MacOSX27.0.sdk', tbdText: NEW_TBD },
    { name: 'MacOSX27.sdk', tbdText: NEW_TBD },
    { name: 'notes.txt', tbdText: OLD_TBD },
  ];
  assert.equal(pickFallbackSdk('/sdks', candidates), join('/sdks', 'MacOSX26.5.sdk'));
});

void test('no fallback when every SDK needs the new format', () => {
  assert.equal(
    pickFallbackSdk('/sdks', [
      { name: 'MacOSX27.0.sdk', tbdText: NEW_TBD },
      { name: 'MacOSX27.sdk', tbdText: undefined },
    ]),
    undefined,
  );
  assert.equal(pickFallbackSdk('/sdks', []), undefined);
});

void test('plain arm64e does not disqualify an SDK', () => {
  assert.equal(
    pickFallbackSdk('/sdks', [{ name: 'MacOSX15.sdk', tbdText: OLD_TBD }]),
    join('/sdks', 'MacOSX15.sdk'),
  );
});

void test('retry gating never fires off-contract', () => {
  const stale =
    'ld: warning: ignoring file /MacOSX.sdk/usr/lib/libm.tbd, malformed file\n' +
    'libm.tbd:4:20: error: unknown architecture\n';
  const args = ['-o', 'app'];
  // No signature, no retry — and no filesystem touch.
  assert.equal(
    staleLdRetryArgs(args, 'ld: library not found for -lfoo\n', {
      darwin: true,
      defaultCc: false,
      sanitized: false,
    }),
    undefined,
  );
  // Explicit CC is the caller's toolchain: never second-guessed, even with the signature.
  assert.equal(
    staleLdRetryArgs(args, stale, { darwin: true, defaultCc: false, sanitized: false }),
    undefined,
  );
  // The sanitized path already links with the system compiler.
  assert.equal(
    staleLdRetryArgs(args, stale, { darwin: true, defaultCc: true, sanitized: true }),
    undefined,
  );
  // Off-Darwin: Linux and Windows keep their behavior exactly.
  assert.equal(
    staleLdRetryArgs(args, stale, { darwin: false, defaultCc: true, sanitized: false }),
    undefined,
  );
});

void test('filesystem half resolves against a double root', () => {
  const root = mkdtempSync(join(tmpdir(), 'stator-sdks-'));
  try {
    mkdirSync(join(root, 'MacOSX26.5.sdk', 'usr', 'lib'), { recursive: true });
    mkdirSync(join(root, 'MacOSX27.0.sdk', 'usr', 'lib'), { recursive: true });
    writeFileSync(tbdPathOf(join(root, 'MacOSX26.5.sdk')), OLD_TBD);
    writeFileSync(tbdPathOf(join(root, 'MacOSX27.0.sdk')), NEW_TBD);
    assert.equal(findFallbackSdk(root), join(root, 'MacOSX26.5.sdk'));
    assert.equal(findFallbackSdk(join(root, 'absent')), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
