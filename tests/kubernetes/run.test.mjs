import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BACKENDS, deployment } from './fixtures.mjs';
import { NODE_IMAGE, run, waitForJob } from './run.mjs';

async function exercise(t, { failure, interruptAt, collision = false, contextMismatch = false, jobFailed = false, partialBuild = false, missingReceipt = false } = {}) {
  const calls = [];
  const artifacts = await mkdtemp(join(tmpdir(), 'mltp-k8s-runner-'));
  t.after(() => rm(artifacts, { recursive: true, force: true }));
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const signals = new EventEmitter();
  let podReads = 0;
  const execute = async (args, options) => {
    calls.push({ args, options });
    const [tool] = args;
    const stage = tool === 'kind' ? args[1] === '--version' ? 'kind-version' : args[1] :
      tool === 'docker' ? args[1] === 'image' ? `image-${args[2]}` : args.includes('build') ? 'build' : args.includes('pull') ? 'pull' : args.includes('config') ? 'compose-config' : 'compose-version' :
      args[1] === 'version' ? 'client-version' : args.includes('current-context') ? 'context' : args.includes('--dry-run=client') ? 'source' :
      args.includes('apply') ? 'apply' : args.includes('wait') ? 'wait' : args.includes('restart') ? 'restart' :
      args.includes('status') ? 'rollout' : args.includes('logs') ? 'logs' :
      args.includes('pvc') ? 'pvc' : args.includes('pods') ? 'pods' : args.includes('job') ? 'job' : 'diagnostics';
    if (interruptAt === stage) {
      signals.emit('SIGTERM');
      throw new Error('interrupted');
    }
    if (failure === stage) throw new Error(`failed ${stage}`);
    const cluster = options.env.COMPOSE_PROJECT_NAME;
    if (stage === 'get') return collision ? cluster + '\n' : 'unrelated-cluster\n';
    if (stage === 'compose-version') return '5.6.0';
    if (stage === 'compose-config') {
      return JSON.stringify({ services: {
        ...Object.fromEntries(BACKENDS.map(name => [name, { image: `${name}:source-version` }])),
        smoke: { image: 'node:test' },
      } });
    }
    if (stage === 'context') return contextMismatch ? 'production' : `kind-${cluster}`;
    if (stage === 'source') return JSON.stringify({ kind: 'List', items: [
      ...['mythical-server', 'mythical-requester', 'mythical-recorder', 'mythical-queue', 'mythical-database']
        .map(name => deployment(name, { name, image: `${name}:source-version`, env: [] })),
      { kind: 'PersistentVolumeClaim', metadata: { name: 'mythical-beasts-data' } },
    ] });
    if (stage === 'job') return JSON.stringify({ status: jobFailed ? { failed: 1 } : { succeeded: 1 } });
    if (stage === 'pvc') return JSON.stringify({ metadata: { uid: 'original-pvc' }, spec: { volumeName: 'original-volume' }, status: { phase: 'Bound' } });
    if (stage === 'pods') return JSON.stringify({ items: [{ metadata: { uid: podReads++ === 0 ? 'old-pod' : 'new-pod', name: 'database' }, spec: { containers: [{ name: 'postgres' }] } }] });
    if (stage === 'logs' && args.some(arg => arg.startsWith('job/'))) {
      if (missingReceipt) return '';
      return args.includes('job/smoke') ? 'PASS: Kubernetes smoke checks' :
        args.includes('job/persistence-seed') ? 'PASS: PostgreSQL persistence seed' : 'PASS: PostgreSQL persistence verify';
    }
    if (stage === 'image-ls') return ['server', ...(partialBuild ? [] : ['requester', 'recorder', 'frontend'])]
      .map(name => `${cluster}-${name}:smoke`).concat(['unrelated-image:smoke']).join('\n');
    return '{}';
  };
  const result = await run({
    execute, environment: { SMOKE_ARTIFACT_DIR: artifacts, KUBECONFIG: '/existing/production/config', COMPOSE_PROFILES: 'load' },
    signals, pause: async () => {}, fixtures: async () => [],
  });
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
  return { result, calls, artifacts };
}
const has = (calls, tool, verb) => calls.some(({ args }) => args[0] === tool && args[1] === verb);

test('successful Kubernetes runner never uses the active kubeconfig or existing clusters', async t => {
  const { result, calls, artifacts } = await exercise(t);
  assert.equal(result, 0);
  const names = new Set(calls.map(({ options }) => options.env.COMPOSE_PROJECT_NAME));
  assert.equal(names.size, 1);
  const cluster = [...names][0];
  assert.match(cluster, /^mltp-k8s-[a-f0-9]{12}$/);
  const kubeconfig = join(artifacts, `${cluster}.kubeconfig`);
  assert(calls.every(({ options }) => options.env.KUBECONFIG === kubeconfig && options.env.KIND_EXPERIMENTAL_PROVIDER === 'docker'));
  for (const { args } of calls.filter(({ args }) => args[0] === 'kubectl')) {
    if (args[1] === 'version') continue;
    assert(args.includes('--kubeconfig') && args.includes(kubeconfig));
    if (args.includes('current-context')) continue;
    assert(args.includes('--context') && args.includes(`kind-${cluster}`));
    assert(args.includes('--namespace') && args.includes('default'));
  }
  const create = calls.find(({ args }) => args[0] === 'kind' && args[1] === 'create');
  assert(create.args.includes(NODE_IMAGE));
  assert(create.args.includes('--kubeconfig') && create.args.includes(kubeconfig));
  const deletion = calls.find(({ args }) => args[0] === 'kind' && args[1] === 'delete');
  assert(deletion.args.includes(cluster));
  assert(deletion.args.includes(kubeconfig));
  const removed = calls.find(({ args }) => args[0] === 'docker' && args[1] === 'image' && args[2] === 'rm');
  assert.deepEqual(removed.args.slice(3), ['server', 'requester', 'recorder', 'frontend'].map(name => `${cluster}-${name}:smoke`));
  const manifest = JSON.parse(await readFile(join(artifacts, 'resources.json'), 'utf8'));
  assert.equal(manifest.kind, 'List');
  assert.equal(await readFile(join(artifacts, 'smoke.log'), 'utf8'), 'PASS: Kubernetes smoke checks');
  const seed = JSON.parse(await readFile(join(artifacts, 'persistence-seed.json'), 'utf8'));
  assert.match(seed.spec.template.spec.containers[0].env[0].value, /^[a-z0-9_]{1,50}$/);
  assert(has(calls, 'kind', 'export'));
  assert(calls.some(({ args }) => args.includes('restart') && args.includes('deployment/mythical-database')));
});

test('an unexpected current context prevents applying any resources', async t => {
  const { result, calls } = await exercise(t, { contextMismatch: true });
  assert.equal(result, 1);
  assert(!calls.some(({ args }) => args.includes('apply')));
  assert(has(calls, 'kind', 'delete'));
});
test('cluster-name collision refuses to build, create, or delete anything', async t => {
  const { result, calls } = await exercise(t, { collision: true });
  assert.equal(result, 1);
  assert(!has(calls, 'kind', 'create'));
  assert(!has(calls, 'kind', 'delete'));
  assert(!calls.some(({ args }) => args.includes('build')));
});
for (const failure of ['kind-version', 'compose-version', 'compose-config']) {
  test(`${failure} failure does not create or delete a cluster`, async t => {
    const { result, calls } = await exercise(t, { failure });
    assert.equal(result, 1);
    assert(!has(calls, 'kind', 'create'));
    assert(!has(calls, 'kind', 'delete'));
  });
}
test('partial build failure removes only tags built by this run', async t => {
  const { result, calls } = await exercise(t, { failure: 'build', partialBuild: true });
  assert.equal(result, 1);
  assert(!has(calls, 'kind', 'create'));
  const removal = calls.find(({ args }) => args[1] === 'image' && args[2] === 'rm');
  assert.equal(removal.args.length, 4);
});
for (const failure of ['create', 'load', 'apply', 'wait', 'restart', 'rollout', 'pvc']) {
  test(`${failure} failure cleans up its cluster and application image tags`, async t => {
    const { result, calls } = await exercise(t, { failure });
    assert.equal(result, 1);
    assert(has(calls, 'kind', 'delete'));
    assert(calls.some(({ args }) => args[1] === 'image' && args[2] === 'rm'));
  });
}
test('successful Job without a completion marker fails instead of reporting a false pass', async t => {
  const { result, calls } = await exercise(t, { missingReceipt: true });
  assert.equal(result, 1);
  assert(has(calls, 'kind', 'delete'));
  assert(!calls.some(({ args }) => args.includes('restart')));
});
test('failed check Job fails the run and still collects diagnostics', async t => {
  const { result, calls, artifacts } = await exercise(t, { jobFailed: true });
  assert.equal(result, 1);
  assert(has(calls, 'kind', 'delete'));
  assert.equal(await readFile(join(artifacts, 'events.log'), 'utf8'), '{}');
});
for (const failure of ['delete', 'image-ls', 'image-rm']) {
  test(`${failure} cleanup failure makes the runner fail`, async t => {
    const { result } = await exercise(t, { failure });
    assert.equal(result, 1);
  });
}
test('diagnostic failure does not prevent deletion or image cleanup', async t => {
  const { result, calls } = await exercise(t, { failure: 'diagnostics' });
  assert.equal(result, 0);
  assert(has(calls, 'kind', 'delete'));
  assert(calls.some(({ args }) => args[1] === 'image' && args[2] === 'rm'));
});
for (const interruptAt of ['build', 'create', 'load', 'job']) {
  test(`interruption at ${interruptAt} returns 130 and cleanup has no aborted signal`, async t => {
    const { result, calls } = await exercise(t, { interruptAt });
    assert.equal(result, 130);
    const cleanup = calls.filter(({ args }) => args[0] === 'kind' && ['delete', 'export'].includes(args[1]) || args[1] === 'image');
    assert(cleanup.length);
    assert(cleanup.every(({ options }) => options.signal === undefined));
  });
}

test('Job polling waits for a successful result', async () => {
  let count = 0;
  await waitForJob('test', ['kubectl'], async () => JSON.stringify({ status: count++ ? { succeeded: 1 } : { active: 1 } }), { pause: async () => {}, attempts: 2 });
  assert.equal(count, 2);
});
for (const status of [{ failed: 1 }, { conditions: [{ type: 'Failed', status: 'True' }] }]) {
  test('Job failure fails immediately rather than waiting for completion', async () => {
    await assert.rejects(waitForJob('test', ['kubectl'], async () => JSON.stringify({ status }), { pause: async () => {} }), /job test failed/);
  });
}
test('Job polling has a bounded timeout', async () => {
  let count = 0;
  await assert.rejects(waitForJob('test', ['kubectl'], async () => { count++; return '{"status":{"active":1}}'; }, { pause: async () => {}, attempts: 2 }), /timed out/);
  assert.equal(count, 2);
});
