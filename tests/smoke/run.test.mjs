import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { command, requireComposeVersion, run } from './run.mjs';

for (const version of ['2.24.0', 'v2.24.0', '2.24.1-desktop.1', '2.40.0', '5.6.0']) {
  test(`Compose ${version} is supported`, () => requireComposeVersion(version));
}
for (const version of ['2.23.9', 'v2.20.0', '1.29.2', '', 'unknown', '2.24']) {
  test(`Compose ${version || '(empty)'} fails explicitly`, () => {
    assert.throws(() => requireComposeVersion(version), /Docker Compose 2.24.0 or newer is required/);
  });
}

async function exercise(t, { failures = [], version = '2.24.0', partialBuild = false, interruptAt } = {}) {
  const calls = [];
  const artifacts = await mkdtemp(join(tmpdir(), 'mltp-smoke-test-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  const signals = new EventEmitter();
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const execute = async (args, options) => {
    calls.push({ args, options });
    const step = args.includes('version') ? 'version' :
      args.includes('build') ? 'build' : args.includes('pull') ? 'pull' :
      args.includes('up') ? 'up' : args.includes('run') ? 'run' :
      args.includes('down') ? 'down' : args.includes('logs') ? 'logs' :
      args[1] === 'image' ? args[2] : 'other';
    if (interruptAt === step) {
      signals.emit('SIGTERM');
      throw new Error('interrupted');
    }
    if (failures.includes(step)) throw new Error(`failed ${step}`);
    if (step === 'version') return version;
    if (step === 'ls') {
      const project = options.env.COMPOSE_PROJECT_NAME;
      return ['server', ...(partialBuild ? [] : ['requester', 'recorder', 'frontend'])]
        .map(service => `${project}-${service}:smoke`).concat(['other-project-server:smoke', 'grafana/loki:3.7.2']).join('\n');
    }
    return '{}';
  };
  const result = await run({ execute, environment: { SMOKE_ARTIFACT_DIR: artifacts, COMPOSE_PROFILES: 'load' }, signals });
  assert.equal(signals.listenerCount('SIGTERM'), 0);
  assert.equal(signals.listenerCount('SIGINT'), 0);
  return { result, calls, artifacts };
}
const hasStep = (calls, step) => calls.some(({ args }) => args.includes(step));

test('successful runner isolates stack and removes only its four images', async t => {
  const { result, calls, artifacts } = await exercise(t);
  assert.equal(result, 0);
  const projects = new Set(calls.map(({ options }) => options.env.COMPOSE_PROJECT_NAME));
  assert.equal(projects.size, 1);
  const project = [...projects][0];
  assert.match(project, /^mltp-smoke-[a-f0-9]{12}$/);
  assert(calls.every(({ options }) => options.env.COMPOSE_PROFILES === ''));
  assert.deepEqual(calls[0].args, ['docker', 'compose', 'version', '--short']);
  const down = calls.find(({ args }) => args.includes('down'));
  assert(down.args.includes('--volumes'));
  assert(down.args.includes('--remove-orphans'));
  assert.deepEqual(calls.at(-1).args, ['docker', 'image', 'rm',
    ...['server', 'requester', 'recorder', 'frontend'].map(service => `${project}-${service}:smoke`)]);
  assert(calls.indexOf(down) < calls.length - 1);
  assert.equal(await readFile(join(artifacts, 'compose.json'), 'utf8'), '{}');
  assert.equal(await readFile(join(artifacts, 'compose.log'), 'utf8'), '{}');
  assert.equal(await readFile(join(artifacts, 'containers.json'), 'utf8'), '{}');
});
for (const failure of ['run', 'up', 'pull', 'build']) {
  test(`${failure} failure cleans up any built images`, async t => {
    const { result, calls } = await exercise(t, { failures: [failure], partialBuild: failure === 'build' });
    assert.equal(result, 1);
    assert.equal(calls.at(-1).args[2], 'rm');
    if (failure === 'run' || failure === 'up') {
      assert(hasStep(calls, 'logs'));
      assert(hasStep(calls, 'down'));
    } else {
      assert(!hasStep(calls, 'up'));
      assert(!hasStep(calls, 'down'));
    }
    if (failure === 'build') assert.equal(calls.at(-1).args.length, 4);
  });
}
test('old Compose fails before config, build or cleanup', async t => {
  const { result, calls } = await exercise(t, { version: '2.23.9' });
  assert.equal(result, 1);
  assert.equal(calls.length, 1);
});
test('unavailable Compose fails without starting stack', async t => {
  const { result, calls } = await exercise(t, { failures: ['version'] });
  assert.equal(result, 1);
  assert.equal(calls.length, 1);
});
test('down failure still attempts image removal and returns failure', async t => {
  const { result, calls } = await exercise(t, { failures: ['down'] });
  assert.equal(result, 1);
  assert.equal(calls.at(-1).args[2], 'rm');
});
for (const failure of ['ls', 'rm']) {
  test(`image ${failure} failure returns failure`, async t => {
    const { result, calls } = await exercise(t, { failures: [failure] });
    assert.equal(result, 1);
    assert(hasStep(calls, 'down'));
  });
}
test('diagnostic failure does not prevent cleanup', async t => {
  const { result, calls } = await exercise(t, { failures: ['run', 'logs'] });
  assert.equal(result, 1);
  assert(hasStep(calls, 'down'));
  assert.equal(calls.at(-1).args[2], 'rm');
});
for (const interruptAt of ['build', 'up', 'run']) {
  test(`interruption at ${interruptAt} returns 130 and cleans up without aborted signal`, async t => {
    const { result, calls } = await exercise(t, { interruptAt });
    assert.equal(result, 130);
    const cleanup = calls.filter(({ args }) => args.includes('down') || args[1] === 'image');
    assert(cleanup.length);
    assert(cleanup.every(({ options }) => options.signal === undefined));
    assert.equal(calls.at(-1).args[2], 'rm');
  });
}

test('command captures stdout', async t => {
  t.mock.method(console, 'log', () => {});
  assert.equal(await command([process.execPath, '-e', 'process.stdout.write("ok")'], {
    env: process.env, timeout: 5000, capture: true,
  }), 'ok');
});
test('command rejects nonzero exit', async t => {
  t.mock.method(console, 'log', () => {});
  await assert.rejects(command([process.execPath, '-e', 'process.exit(3)'], {
    env: process.env, timeout: 5000,
  }), /exit 3/);
});
test('command enforces timeout', async t => {
  t.mock.method(console, 'log', () => {});
  await assert.rejects(command([process.execPath, '-e', 'setInterval(() => {}, 1000)'], {
    env: process.env, timeout: 50,
  }), /timed out/);
});
test('command waits for an aborted child to close', async t => {
  t.mock.method(console, 'log', () => {});
  const controller = new AbortController();
  const pending = command([process.execPath, '-e', 'setInterval(() => {}, 1000)'], {
    env: process.env, timeout: 5000, signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
test('command handles missing executable', async t => {
  t.mock.method(console, 'log', () => {});
  await assert.rejects(command(['mltp-nonexistent-command'], {
    env: process.env, timeout: 5000,
  }), /ENOENT/);
});
