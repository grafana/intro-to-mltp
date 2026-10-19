import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { APPLICATIONS, BACKENDS, assertSamePvc, checkJob, configurationMount, configureApplications, deployment, parseResources, service, supportResources } from './fixtures.mjs';
import { persistence } from './persistence.mjs';

const images = Object.fromEntries(APPLICATIONS.map(name => [name, `test-${name}:smoke`]));
function application() {
  return [...['mythical-server', 'mythical-requester', 'mythical-recorder', 'mythical-queue', 'mythical-database'].map(name => {
    const resource = deployment(name, {
      name, image: `${name}:upstream`, imagePullPolicy: 'Always',
      env: [{ name: 'TRACING_COLLECTOR_HOST', value: '<tracingEndpoint>' }, { name: 'OTEL_RESOURCE_ATTRIBUTES', value: 'ip=$(POD_IP)' }],
    });
    resource.spec.replicas = name === 'mythical-server' ? 3 : 1;
    if (name === 'mythical-database') resource.spec.template.spec.volumes = [{ name: 'data', persistentVolumeClaim: { claimName: 'mythical-beasts-data' } }];
    return resource;
  }), { apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: { name: 'mythical-beasts-data' }, spec: { resources: { requests: { storage: '10Gi' } } } }];
}

test('test overrides keep replicas, PVC, pod attributes, and source objects intact', () => {
  const source = application();
  const copy = structuredClone(source);
  const result = configureApplications(source, images);
  assert.deepEqual(source, copy);
  const server = result[0];
  assert.equal(server.spec.replicas, 3);
  const container = server.spec.template.spec.containers[0];
  assert.equal(container.image, images['mythical-server']);
  assert.equal(container.imagePullPolicy, 'Never');
  assert.deepEqual(container.env.find(env => env.name === 'OTEL_RESOURCE_ATTRIBUTES'), { name: 'OTEL_RESOURCE_ATTRIBUTES', value: 'ip=$(POD_IP)' });
  assert.equal(container.env.filter(env => env.name === 'TRACING_COLLECTOR_HOST').length, 1);
  for (const [name, value] of Object.entries({ TRACING_COLLECTOR_HOST: 'alloy', PROFILE_COLLECTOR_HOST: 'alloy', PROFILE_COLLECTOR_PORT: '4040', ALWAYS_SUCCEED: 'true' })) {
    assert(container.env.some(env => env.name === name && env.value === value));
  }
  assert.equal(result[3].spec.template.spec.containers[0].image, 'mythical-queue:upstream');
  assert.deepEqual(result[4].spec.template.spec.volumes, copy[4].spec.template.spec.volumes);
  assert.deepEqual(result[5], copy[5]);
});
for (const missing of ['mythical-server', 'mythical-database', 'mythical-beasts-data']) {
  test(`missing ${missing} fails instead of silently replacing repository resources`, () => {
    assert.throws(() => configureApplications(application().filter(item => item.metadata.name !== missing), images), /Missing/);
  });
}
test('missing application image fails', () => assert.throws(() => configureApplications(application(), {}), /Missing local/));

test('resource parsing supports concatenated kubectl JSON objects and embedded braces', () => {
  const objects = [{ kind: 'ConfigMap', data: { value: '} { "quoted" \\ path' } }, { kind: 'Service', metadata: { name: 'service' } }];
  assert.deepEqual(parseResources(objects.map(object => JSON.stringify(object, null, 2)).join('\n')), objects);
  assert.deepEqual(parseResources(JSON.stringify({ kind: 'List', items: objects })), objects);
});
for (const output of ['', '{} garbage', '{"kind":', '{"kind":"List"}']) {
  test(`invalid or incomplete Kubernetes JSON fails: ${output}`, () => assert.throws(() => parseResources(output)));
}

test('service selector matches deployment pod labels', () => {
  const pod = deployment('alloy', { image: 'alloy:test' });
  const svc = service('alloy', [12345, 4317]);
  assert.deepEqual(pod.spec.template.metadata.labels, svc.spec.selector);
  assert.deepEqual(svc.spec.ports.map(port => port.port), [12345, 4317]);
});

async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'mltp-k8s-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test('directory ConfigMap preserves nested provisioning paths and excludes binary files', async t => {
  const root = await directory(t);
  await mkdir(join(root, 'dashboards'));
  await writeFile(join(root, 'dashboards', 'mlt.yaml'), 'apiVersion: 1\n');
  await writeFile(join(root, '.DS_Store'), 'binary');
  const result = await configurationMount(root, '/etc/grafana/provisioning', 'test-provisioning', root);
  assert.deepEqual(result.resource.data, { 'file-0': 'apiVersion: 1\n' });
  assert.deepEqual(result.volume.configMap.items, [{ key: 'file-0', path: 'dashboards/mlt.yaml' }]);
  assert(!('subPath' in result.mount));
  assert.equal(result.mount.readOnly, true);
});
test('single-file ConfigMap uses subPath and source contents', async t => {
  const root = await directory(t);
  await writeFile(join(root, 'tempo.yaml'), 'server: {}\n');
  const result = await configurationMount(join(root, 'tempo.yaml'), '/etc/tempo.yaml', 'tempo', root);
  assert.equal(result.mount.subPath, 'tempo.yaml');
  assert.equal(result.mount.mountPath, '/etc/tempo.yaml');
  assert.equal(result.resource.data['file-0'], 'server: {}\n');
});
test('outside configuration paths fail', async t => {
  const root = await directory(t);
  await assert.rejects(configurationMount('/etc/passwd', '/etc/passwd', 'outside', root), /inside the repository/);
});
test('configuration symlinks cannot copy files outside the repository', async t => {
  const root = await directory(t);
  const outside = await directory(t);
  await writeFile(join(outside, 'external.yaml'), 'outside: true');
  await symlink(join(outside, 'external.yaml'), join(root, 'linked.yaml'));
  await assert.rejects(configurationMount(join(root, 'linked.yaml'), '/linked.yaml', 'linked', root), /inside the repository/);
});
test('oversized configuration fails before applying a ConfigMap', async t => {
  const root = await directory(t);
  await writeFile(join(root, 'large.json'), 'x'.repeat(900000));
  await assert.rejects(configurationMount(join(root, 'large.json'), '/large.json', 'large', root), /size limit/);
});

test('support fixtures reuse Compose images, commands, and environment rather than pinning a second stack', async t => {
  const root = await directory(t);
  const services = Object.fromEntries([...BACKENDS, 'mythical-frontend'].map(name => [name, {
    image: `${name}:source-version`, command: ['source-command'], environment: { FROM_COMPOSE: 'true' },
  }]));
  const result = await supportResources({ compose: { services }, images, root, scripts: { 'check.mjs': 'source test' } });
  for (const name of BACKENDS) {
    const container = result.find(item => item.kind === 'Deployment' && item.metadata.name === name).spec.template.spec.containers[0];
    assert.equal(container.image, services[name].image);
    assert.deepEqual(container.args, services[name].command);
    assert.deepEqual(container.env, [{ name: 'FROM_COMPOSE', value: 'true' }]);
  }
  const alloy = result.find(item => item.kind === 'Deployment' && item.metadata.name === 'alloy');
  assert.equal(alloy.spec.template.spec.serviceAccountName, 'smoke-alloy');
  const role = result.find(item => item.kind === 'Role');
  assert.equal(role.metadata.namespace, 'default');
  assert.deepEqual(role.rules, [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list', 'watch'] }]);
  assert(!result.some(item => item.kind === 'ClusterRole' || item.kind === 'ClusterRoleBinding'));
  assert.equal(result.find(item => item.kind === 'Deployment' && item.metadata.name === 'mythical-frontend').spec.template.spec.containers[0].image, images['mythical-frontend']);
  assert(result.some(item => item.kind === 'Service' && item.metadata.name === 'mythical-recorder'));
  assert(result.some(item => item.kind === 'ConfigMap' && item.data['check.mjs'] === 'source test'));
});

for (const mode of ['seed', 'verify']) {
  test(`persistence Job eval command passes ${mode} through the real Node argv`, () => {
    const fixture = 'unique_fixture';
    const container = checkJob('test', 'node:test', mode, fixture).spec.template.spec.containers[0];
    const args = container.command.slice(1);
    // Replace only the cluster module with a stub. Execute the actual bootstrap and CLI arguments.
    const stub = `import assert from 'node:assert/strict';
      export async function persistence(mode, name) {
        assert.equal(mode, ${JSON.stringify(mode)});
        assert.equal(name, ${JSON.stringify(fixture)});
      }`;
    const module = 'data:text/javascript;base64,' + Buffer.from(stub).toString('base64');
    args[2] = args[2].replace('/tests/kubernetes/persistence.mjs', module);
    const output = execFileSync(process.execPath, args, {
      env: { ...process.env, PERSISTENCE_NAME: fixture }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(output.trim(), `PASS: PostgreSQL persistence ${mode}`);
  });
}

test('check jobs are bounded, do not retry failures, and only use locally loaded images', () => {
  const job = checkJob('test', 'node:test', 'verify', 'unique_fixture');
  assert.equal(job.spec.backoffLimit, 0);
  assert.equal(job.spec.activeDeadlineSeconds, 660);
  const pod = job.spec.template.spec;
  assert.equal(pod.restartPolicy, 'Never');
  assert.equal(pod.containers[0].imagePullPolicy, 'Never');
  assert.deepEqual(pod.containers[0].command.slice(0, 3), ['node', '--input-type=module', '-e']);
  assert(pod.containers[0].command[3].includes("await persistence(process.argv[1]"));
  assert.equal(pod.containers[0].command[4], 'verify');
  assert.equal(pod.volumes[0].configMap.items[0].path, 'smoke/check.mjs');
});
const boundPvc = () => ({ metadata: { uid: 'existing' }, spec: { volumeName: 'same-volume' }, status: { phase: 'Bound' } });
test('unchanged bound PVC passes persistence identity check', () => assertSamePvc(boundPvc(), boundPvc()));
for (const [field, value] of [['uid', 'replacement'], ['volumeName', 'replacement'], ['phase', 'Pending']]) {
  test(`changed PVC ${field} fails`, () => {
    const after = boundPvc();
    if (field === 'uid') after.metadata.uid = value;
    else if (field === 'volumeName') after.spec.volumeName = value;
    else after.status.phase = value;
    assert.throws(() => assertSamePvc(boundPvc(), after));
  });
}

test('persistence seed requires the created name to appear', async () => {
  const calls = [];
  await persistence('seed', 'unique_fixture', {
    checks: { namesAt: async () => ['unique_fixture'] },
    http: async (url, options) => calls.push(options),
    wait: async checks => { for (const check of Object.values(checks)) await check(); },
  });
  assert.deepEqual(calls, [{ method: 'POST', body: { name: 'unique_fixture' }, status: 201 }]);
});
for (const names of [[], ['unrelated']]) {
  test('missing persisted data fails even when API is healthy', async () => {
    await assert.rejects(persistence('verify', 'unique_fixture', {
      checks: { namesAt: async () => names }, http: async () => {},
      wait: async checks => { for (const check of Object.values(checks)) await check(); },
    }), /lost the persisted name/);
  });
}
test('persistence verification requires data and confirms fixture deletion', async () => {
  let deleted = false;
  await persistence('verify', 'unique_fixture', {
    checks: { namesAt: async () => deleted ? [] : ['unique_fixture'] },
    http: async (url, options) => { assert.equal(options.method, 'DELETE'); deleted = true; },
    wait: async checks => { for (const check of Object.values(checks)) await check(); },
  });
  assert(deleted);
});
test('persistence verification fails if deletion did not work', async () => {
  await assert.rejects(persistence('verify', 'unique_fixture', {
    checks: { namesAt: async () => ['unique_fixture'] }, http: async () => {},
    wait: async checks => { for (const check of Object.values(checks)) await check(); },
  }), /was not deleted/);
});
for (const [mode, fixture] of [['unknown', 'name'], ['seed', ''], ['seed', undefined], ['seed', '../escape'], ['seed', 'x'.repeat(51)]]) {
  test(`invalid persistence input ${mode}/${fixture} fails without HTTP`, async () => {
    await assert.rejects(persistence(mode, fixture, { http: async () => assert.fail('HTTP should not run') }));
  });
}

test('Jobs mount the current shared assertions without a fork', async () => {
  const source = await readFile(new URL('../smoke/check.mjs', import.meta.url), 'utf8');
  assert(source.includes('export async function main()'));
  assert(checkJob('smoke', 'node:test').spec.template.spec.containers[0].command[3].includes("from '/tests/kubernetes/check.mjs'; await check()"));
});
