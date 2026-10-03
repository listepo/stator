/** OpenTelemetry export contract (plan-notes 187): spans flow OUT through the standard OTLP
 * endpoint when opted in, and `.env` (dotenv) is read before the opt-in is consulted. The file may
 * set the opt-in only; the exporter's `OTEL_*` configuration comes from the real environment
 * (plan.md §9 Task 6.21).
 *
 * The async execa here is deliberate, not style: the test's HTTP server must answer the exporter's
 * POST mid-child-process, which a sync spawn would block the event loop from doing. */
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO, 'compiler', 'src', 'cli', 'main.ts');

interface Captured {
  readonly path: string;
  readonly body: string;
}

async function startReceiver(captured: Captured[]): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      captured.push({ path: req.url ?? '', body: Buffer.concat(chunks).toString('latin1') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(typeof address === 'object' && address !== null, 'the receiver must be listening');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

/** Opens a one-entry program in a fresh directory so the assertion is only about telemetry,
 * never about whatever fixture lived there before. */
function fixture(): { work: string; entry: string; env: NodeJS.ProcessEnv } {
  const work = mkdtempSync(join(tmpdir(), 'stator-otel-'));
  const entry = join(work, 'hello.ts');
  writeFileSync(entry, 'function answer(): number { return 42; }\nconsole.log(answer());\n');
  return { work, entry, env: {} };
}

async function runCli(fixtureDir: { work: string; entry: string }, env?: NodeJS.ProcessEnv) {
  const result = await execa(process.execPath, [CLI, 'explain', fixtureDir.entry, '--json'], {
    cwd: fixtureDir.work,
    reject: false,
    stripFinalNewline: false,
    ...(env === undefined ? {} : { env }),
  });
  return { status: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

test('STATOR_OTEL exports pipeline spans over OTLP without breaking machine output', async () => {
  const captured: Captured[] = [];
  const f = fixture();
  const { server, url } = await startReceiver(captured);
  try {
    const run = await runCli(f, { STATOR_OTEL: '1', OTEL_EXPORTER_OTLP_ENDPOINT: url });
    assert.equal(run.status, 0, run.stderr);
    // The opt-in must not touch the JSON contract on stdout.
    assert.match(run.stdout, /"verdict":"static"/);
    assert.ok(captured.length >= 1, run.stderr);
    // SimpleSpanProcessor flushes per span, so the pipeline arrives as one POST per span.
    for (const request of captured) {
      assert.equal(request.path, '/v1/traces');
    }
    const body = captured.map((request) => request.body).join('');
    // Proto-serialized span names survive as ASCII inside the body: assert the pipeline stages,
    // not the encoding.
    assert.ok(body.includes('stator'), 'resource service.name missing from the export');
    assert.ok(body.includes('stator explain'), 'the root command span is missing');
    assert.ok(body.includes('frontend/program'), 'the program span is missing');
    assert.ok(body.includes('frontend/gate'), 'the gate span is missing');
    assert.ok(body.includes('frontend/module-graph'), 'the graph span is missing');
    assert.ok(body.includes('lower'), 'the lowering span is missing');
  } finally {
    rmSync(f.work, { recursive: true, force: true });
    server.close();
  }
});

test('without STATOR_OTEL nothing is traced', async () => {
  const captured: Captured[] = [];
  const f = fixture();
  const { server, url } = await startReceiver(captured);
  try {
    const run = await runCli(f, { OTEL_EXPORTER_OTLP_ENDPOINT: url });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(captured.length, 0, 'no telemetry may leak when the switch is off');
  } finally {
    rmSync(f.work, { recursive: true, force: true });
    server.close();
  }
});

test('.env switches telemetry on, but only the real environment picks the exporter', async () => {
  const fromFile: Captured[] = [];
  const fromEnv: Captured[] = [];
  const f = fixture();
  const file = await startReceiver(fromFile);
  const real = await startReceiver(fromEnv);
  try {
    // The switch comes from the program's OWN directory: dotenv must have been loaded before
    // telemetryInit() looked. The endpoint in the same file must be ignored -- the project being
    // compiled cannot send the compiler's spans to a host of its choosing (plan.md §9 Task 6.21).
    writeFileSync(join(f.work, '.env'), `STATOR_OTEL=1\nOTEL_EXPORTER_OTLP_ENDPOINT=${file.url}\n`);
    const run = await runCli(f, { STATOR_OTEL: undefined, OTEL_EXPORTER_OTLP_ENDPOINT: real.url });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(fromEnv.length >= 1, 'a .env opt-in must export exactly like an env-var opt-in');
    assert.equal(fromFile.length, 0, 'the exporter endpoint came from the project .env');
    assert.match(
      run.stderr,
      /stator: \.env: applied STATOR_OTEL; ignored OTEL_EXPORTER_OTLP_ENDPOINT/,
    );
  } finally {
    rmSync(f.work, { recursive: true, force: true });
    file.server.close();
    real.server.close();
  }
});
