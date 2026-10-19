// Use the real application manifests and derive test backends from Compose.
import assert from 'node:assert/strict';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { alloyConfiguration } from './alloy.mjs';

export const APPLICATIONS = ['mythical-server', 'mythical-requester', 'mythical-recorder', 'mythical-frontend'];
export const BACKENDS = ['alloy', 'grafana', 'tempo', 'loki', 'mimir', 'pyroscope'];
const PORTS = {
  alloy: [12345, 4317, 3100, 4040], grafana: [3000], tempo: [3200, 4317],
  loki: [3100], mimir: [9009], pyroscope: [4040],
  'mythical-frontend': [80], 'mythical-requester': [4001], 'mythical-recorder': [4002],
};
const metadata = name => ({ name, namespace: 'default' });
export const list = items => ({ apiVersion: 'v1', kind: 'List', items });

export function service(name, ports) {
  return {
    apiVersion: 'v1', kind: 'Service', metadata: metadata(name),
    spec: { selector: { name }, ports: ports.map(port => ({ name: `port-${port}`, port, targetPort: port })) },
  };
}

export function deployment(name, container, volumes = []) {
  return {
    apiVersion: 'apps/v1', kind: 'Deployment', metadata: metadata(name),
    spec: {
      replicas: 1, selector: { matchLabels: { name } },
      template: { metadata: { labels: { name } }, spec: { containers: [container], volumes } },
    },
  };
}

// kubectl create prints one JSON object per input resource, not always a List.
export function parseResources(output) {
  const resources = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < output.length; index++) {
    const character = output[index];
    if (start === -1) {
      if (/\s/.test(character)) continue;
      assert.equal(character, '{', 'Expected Kubernetes JSON objects');
      start = index;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') depth++;
    else if (character === '}' || character === ']') {
      depth--;
      if (depth === 0) {
        const resource = JSON.parse(output.slice(start, index + 1));
        if (resource.kind === 'List') {
          assert(Array.isArray(resource.items), 'Kubernetes List has no items');
          resources.push(...resource.items);
        } else resources.push(resource);
        start = -1;
      }
    }
  }
  assert.equal(start, -1, 'Incomplete Kubernetes JSON');
  assert(resources.length, 'No Kubernetes resources found');
  return resources;
}

export function configureApplications(resources, images) {
  const items = structuredClone(resources);
  for (const name of ['mythical-server', 'mythical-requester', 'mythical-recorder', 'mythical-queue', 'mythical-database']) {
    const resource = items.find(item => item.kind === 'Deployment' && item.metadata.name === name);
    assert(resource, `Missing application deployment: ${name}`);
    const containers = resource.spec.template.spec.containers;
    assert.equal(containers.length, 1, `Expected one container in ${name}`);
    const container = containers[0];
    container.imagePullPolicy = 'Never';
    if (APPLICATIONS.includes(name)) {
      assert(images[name], `Missing local application image: ${name}`);
      container.image = images[name];
      const overrides = {
        TRACING_COLLECTOR_HOST: 'alloy', LOGS_TARGET: 'http://alloy:3100/loki/api/v1/push',
        PROFILE_COLLECTOR_HOST: 'alloy', PROFILE_COLLECTOR_PORT: '4040',
        ...(name === 'mythical-server' ? { ALWAYS_SUCCEED: 'true' } : {}),
      };
      // Preserve all other fields, including the server's three replicas and pod-IP attributes.
      container.env = (container.env ?? []).filter(entry => !(entry.name in overrides))
        .concat(Object.entries(overrides).map(([name, value]) => ({ name, value })));
    }
  }
  assert(items.some(item => item.kind === 'PersistentVolumeClaim' && item.metadata.name === 'mythical-beasts-data'), 'Missing database PVC');
  return items;
}

async function filesAt(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await filesAt(resolve(directory, entry.name), path + '/'));
    else if (entry.isFile() && /\.(json|ya?ml|alloy)$/.test(entry.name)) {
      files.push({ path, content: await readFile(resolve(directory, entry.name), 'utf8') });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function configurationMount(source, target, name, root) {
  const local = await realpath(resolve(source));
  const within = relative(await realpath(root), local);
  assert(!isAbsolute(within) && within !== '..' && !within.startsWith('..' + sep), `Configuration must be inside the repository: ${source}`);
  const directory = (await stat(local)).isDirectory();
  const files = directory ? await filesAt(local) : [{ path: basename(local), content: await readFile(local, 'utf8') }];
  assert(files.length, `Empty configuration mount: ${source}`);
  const data = Object.fromEntries(files.map(({ content }, index) => [`file-${index}`, content]));
  assert(Buffer.byteLength(JSON.stringify(data)) < 900000, `Configuration exceeds ConfigMap size limit: ${source}`);
  return {
    resource: { apiVersion: 'v1', kind: 'ConfigMap', metadata: metadata(name), data },
    volume: { name, configMap: { name, items: files.map(({ path }, index) => ({ key: `file-${index}`, path })) } },
    mount: { name, mountPath: target, readOnly: true, ...(!directory ? { subPath: files[0].path } : {}) },
  };
}

export async function supportResources({ compose, images, root, scripts }) {
  const resources = [];
  for (const name of [...BACKENDS, 'mythical-frontend']) {
    const source = compose.services[name];
    assert(source, `Missing Compose service: ${name}`);
    const mounts = [];
    const volumes = [];
    for (const [index, bind] of (source.volumes ?? []).entries()) {
      assert.equal(bind.type, 'bind', `Unsupported test configuration mount in ${name}`);
      const config = await configurationMount(bind.source, bind.target, `smoke-${name}-${index}`, root);
      if (name === 'alloy' && bind.target === '/etc/alloy/config.alloy') {
        config.resource.data['file-0'] = alloyConfiguration(config.resource.data['file-0']);
      }
      resources.push(config.resource);
      volumes.push(config.volume);
      mounts.push(config.mount);
    }
    const container = {
      name, image: images[name] ?? source.image, imagePullPolicy: 'Never',
      ...(source.command ? { args: source.command } : {}),
      env: Object.entries(source.environment ?? {}).map(([name, value]) => ({ name, value: String(value) })),
      volumeMounts: mounts,
    };
    const workload = deployment(name, container, volumes);
    if (name === 'alloy') workload.spec.template.spec.serviceAccountName = 'smoke-alloy';
    resources.push(workload, service(name, PORTS[name]));
  }
  resources.push(
    { apiVersion: 'v1', kind: 'ServiceAccount', metadata: metadata('smoke-alloy') },
    { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'Role', metadata: metadata('smoke-alloy'),
      rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list', 'watch'] }] },
    { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding', metadata: metadata('smoke-alloy'),
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'smoke-alloy' },
      subjects: [{ kind: 'ServiceAccount', name: 'smoke-alloy', namespace: 'default' }] },
  );
  for (const name of ['mythical-requester', 'mythical-recorder']) resources.push(service(name, PORTS[name]));
  resources.push({ apiVersion: 'v1', kind: 'ConfigMap', metadata: metadata('smoke-checks'), data: scripts });
  return resources;
}

export function checkJob(name, image, mode = 'smoke', fixture = '', replicas = 3) {
  return {
    apiVersion: 'batch/v1', kind: 'Job', metadata: metadata(name),
    spec: {
      backoffLimit: 0, activeDeadlineSeconds: 660,
      template: {
        metadata: { labels: { name } },
        spec: {
          restartPolicy: 'Never',
          containers: [{
            name: 'check', image, imagePullPolicy: 'Never',
            // ConfigMap files are symlinks. Import explicitly instead of relying on a main-module path check.
            command: ['node', '--input-type=module', '-e', mode === 'smoke'
              ? "import { check } from '/tests/kubernetes/check.mjs'; await check();"
              : "import { persistence } from '/tests/kubernetes/persistence.mjs'; await persistence(process.argv[1], process.env.PERSISTENCE_NAME); console.log('PASS: PostgreSQL persistence ' + process.argv[1]);", mode],
            env: [{ name: 'PERSISTENCE_NAME', value: fixture }, { name: 'EXPECTED_SERVER_REPLICAS', value: String(replicas) }],
            volumeMounts: [{ name: 'checks', mountPath: '/tests', readOnly: true }],
          }],
          volumes: [{ name: 'checks', configMap: {
            name: 'smoke-checks', items: [
              { key: 'check.mjs', path: 'smoke/check.mjs' },
              { key: 'persistence.mjs', path: 'kubernetes/persistence.mjs' },
              { key: 'kubernetes-check.mjs', path: 'kubernetes/check.mjs' },
            ],
          } }],
        },
      },
    },
  };
}

export function assertSamePvc(before, after) {
  assert.equal(before.status?.phase, 'Bound', 'Database PVC was not bound before the restart');
  assert.equal(after.status?.phase, 'Bound', 'Database PVC is not bound after the restart');
  assert(before.metadata?.uid && before.spec?.volumeName, 'Database PVC has no UID or bound volume');
  assert.equal(after.metadata.uid, before.metadata.uid, 'Database restart replaced the PVC');
  assert.equal(after.spec.volumeName, before.spec.volumeName, 'Database restart changed the bound volume');
}
