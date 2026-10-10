// Run repository manifests in a disposable kind cluster, never the active context.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { command, requireComposeVersion } from '../smoke/run.mjs';
import { APPLICATIONS, BACKENDS, assertSamePvc, checkJob, configureApplications, list, parseResources, supportResources } from './fixtures.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const NODE_IMAGE = 'kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5';

export async function waitForJob(name, kubectl, execute, { pause = sleep, attempts = 140 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const job = JSON.parse(await execute([...kubectl, 'get', 'job', name, '-o', 'json'], 30000, true));
    if (job.status?.conditions?.some(condition => condition.type === 'Failed' && condition.status === 'True') || job.status?.failed) {
      throw new Error(`Kubernetes check job ${name} failed; see pod logs in the diagnostics directory`);
    }
    if (job.status?.succeeded) return;
    if (attempt + 1 < attempts) await pause(5000);
  }
  throw new Error(`Kubernetes check job ${name} timed out`);
}

export async function waitForPodReplacement(pods, oldPods, {
  pause = sleep, now = () => performance.now(), timeout = 180000, interval = 1000, signal,
} = {}) {
  assert(oldPods instanceof Set && oldPods.size && [...oldPods].every(uid => typeof uid === 'string' && uid),
    'Expected original database pod UIDs');
  assert(Number.isFinite(timeout) && timeout > 0 && Number.isFinite(interval) && interval > 0,
    'Pod replacement timeout and interval must be positive');
  const deadline = now() + timeout;
  let remaining;
  let lastPods = [];
  signal?.throwIfAborted();
  while ((remaining = deadline - now()) > 0) {
    signal?.throwIfAborted();
    const resources = await pods(Math.min(30000, Math.ceil(remaining)));
    signal?.throwIfAborted();
    assert(Array.isArray(resources?.items), 'Database pod list has no items array');
    lastPods = resources.items;
    assert(lastPods.every(pod => typeof pod?.metadata?.uid === 'string' && pod.metadata.uid),
      'Database pod has no UID');
    // Rollout completion can precede deletion of the old, already stopped pod object.
    if (lastPods.length && lastPods.every(pod => !oldPods.has(pod.metadata.uid) &&
      !pod.metadata.deletionTimestamp && pod.status?.phase === 'Running' &&
      pod.status.conditions?.some(condition => condition.type === 'Ready' && condition.status === 'True'))) {
      return lastPods;
    }
    const delay = Math.min(interval, Math.max(0, deadline - now()));
    if (delay > 0) await pause(delay, undefined, { signal });
  }
  const state = lastPods.map(pod => `${pod.metadata.name ?? pod.metadata.uid}:${pod.status?.phase ?? 'unknown'}${pod.metadata.deletionTimestamp ? ':deleting' : ''}`).join(', ') || 'none';
  throw new Error(`Database pod replacement timed out after ${timeout / 1000}s; remaining pods: ${state}`);
}

export async function run({
  execute = command, environment = process.env, signals = process,
  pause = sleep, fixtures = supportResources,
} = {}) {
  const cluster = 'mltp-k8s-' + randomUUID().replaceAll('-', '').slice(0, 12);
  const artifacts = resolve(environment.SMOKE_ARTIFACT_DIR ?? resolve(ROOT, 'tests/artifacts', cluster));
  const kubeconfig = resolve(artifacts, `${cluster}.kubeconfig`);
  const env = {
    ...environment, KUBECONFIG: kubeconfig, KIND_EXPERIMENTAL_PROVIDER: 'docker',
    COMPOSE_PROJECT_NAME: cluster, COMPOSE_PROFILES: '',
  };
  await mkdir(artifacts, { recursive: true });
  const kubectl = ['kubectl', '--kubeconfig', kubeconfig, '--context', `kind-${cluster}`, '--namespace', 'default'];
  const compose = ['docker', 'compose', '--project-name', cluster, '-f', resolve(ROOT, 'docker-compose.yml'), '-f', resolve(ROOT, 'tests/smoke/compose.yml')];
  const images = Object.fromEntries(APPLICATIONS.map(name => [name, `${cluster}-${name.replace('mythical-', '')}:smoke`]));
  console.log(`Kubernetes project: ${cluster}\nDiagnostics: ${artifacts}`);
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  signals.on('SIGINT', interrupt);
  signals.on('SIGTERM', interrupt);
  const work = (args, timeout, capture = false) => execute(args, { env, timeout, capture, signal: controller.signal });
  const cleanup = (args, timeout, capture = false) => execute(args, { env, timeout, capture });
  let result = 0;
  let buildAttempted = false;
  let createAttempted = false;
  let clusterReady = false;
  try {
    await work(['kind', '--version'], 30000);
    await work(['kubectl', 'version', '--client', '-o', 'json'], 30000, true);
    requireComposeVersion(await work(['docker', 'compose', 'version', '--short'], 30000, true));
    const existing = (await work(['kind', 'get', 'clusters'], 30000, true)).split('\n');
    assert(!existing.includes(cluster), `Refusing to use existing cluster ${cluster}`);
    const composeConfig = JSON.parse(await work([...compose, '--profile', 'test', 'config', '--format', 'json'], 30000, true));
    await writeFile(resolve(artifacts, 'compose.json'), JSON.stringify(composeConfig, null, 2));
    buildAttempted = true;
    await work([...compose, 'build', ...APPLICATIONS], 900000);
    createAttempted = true;
    await work(['kind', 'create', 'cluster', '--name', cluster, '--image', NODE_IMAGE, '--kubeconfig', kubeconfig, '--wait', '180s'], 360000);
    clusterReady = true;
    const actualContext = (await work(['kubectl', '--kubeconfig', kubeconfig, 'config', 'current-context'], 30000, true)).trim();
    assert.equal(actualContext, `kind-${cluster}`, 'Refusing to use an unexpected Kubernetes context');
    // kubectl parses the source YAML. Its context is always the newly created cluster.
    const source = await work([...kubectl, 'create', '--dry-run=client', '--validate=false', '-f', resolve(ROOT, 'k8s/mythical'), '-o', 'json'], 30000, true);
    await writeFile(resolve(artifacts, 'source-resources.log'), source);
    const application = configureApplications(parseResources(source), images);
    const scripts = {
      'check.mjs': await readFile(resolve(ROOT, 'tests/smoke/check.mjs'), 'utf8'),
      'persistence.mjs': await readFile(resolve(ROOT, 'tests/kubernetes/persistence.mjs'), 'utf8'),
      'kubernetes-check.mjs': await readFile(resolve(ROOT, 'tests/kubernetes/check.mjs'), 'utf8'),
    };
    const support = await fixtures({ compose: composeConfig, images, root: ROOT, scripts });
    const pull = [...new Set([
      ...BACKENDS.map(name => composeConfig.services[name].image),
      ...application.filter(item => item.kind === 'Deployment' && ['mythical-database', 'mythical-queue'].includes(item.metadata.name))
        .map(item => item.spec.template.spec.containers[0].image),
      composeConfig.services.smoke.image,
    ])];
    for (const image of pull) await work(['docker', 'pull', image], 180000);
    await work(['kind', 'load', 'docker-image', '--name', cluster, ...Object.values(images), ...pull], 600000);
    const manifest = resolve(artifacts, 'resources.json');
    await writeFile(manifest, JSON.stringify(list([...application, ...support]), null, 2));
    await work([...kubectl, 'apply', '-f', manifest], 60000);
    await work([...kubectl, 'wait', '--for=condition=Available', 'deployment', '--all', '--timeout=300s'], 360000);
    const job = async (name, mode = 'smoke', fixture = '') => {
      const path = resolve(artifacts, `${name}.json`);
      const replicas = application.find(item => item.kind === 'Deployment' && item.metadata.name === 'mythical-server').spec.replicas ?? 1;
      await writeFile(path, JSON.stringify(checkJob(name, composeConfig.services.smoke.image, mode, fixture, replicas), null, 2));
      await work([...kubectl, 'apply', '-f', path], 30000);
      await waitForJob(name, kubectl, work, { pause });
      const output = await work([...kubectl, 'logs', `job/${name}`, '--timestamps=true'], 30000, true);
      await writeFile(resolve(artifacts, `${name}.log`), output);
      const receipt = mode === 'smoke' ? 'PASS: Kubernetes smoke checks' : `PASS: PostgreSQL persistence ${mode}`;
      assert(output.includes(receipt), `Job ${name} completed without its check completion marker`);
      console.log(output);
    };
    await job('smoke');
    const fixture = 'pvc_' + randomUUID().replaceAll('-', '');
    await job('persistence-seed', 'seed', fixture);
    const pvc = () => work([...kubectl, 'get', 'pvc', 'mythical-beasts-data', '-o', 'json'], 30000, true).then(JSON.parse);
    const before = await pvc();
    const pods = (timeout = 30000) => work([...kubectl, 'get', 'pods', '-l', 'name=mythical-database', '-o', 'json'], timeout, true).then(JSON.parse);
    const oldPods = new Set((await pods()).items.map(pod => pod.metadata.uid));
    assert(oldPods.size && [...oldPods].every(uid => typeof uid === 'string' && uid), 'Expected original database pod UIDs');
    await work([...kubectl, 'rollout', 'restart', 'deployment/mythical-database'], 30000);
    await work([...kubectl, 'rollout', 'status', 'deployment/mythical-database', '--timeout=180s'], 240000);
    await waitForPodReplacement(pods, oldPods, { pause, signal: controller.signal });
    console.log('PASS: Database pod replaced and ready');
    assertSamePvc(before, await pvc());
    await job('persistence-verify', 'verify', fixture);
    console.log('PASS: Kubernetes stack and database PVC persistence');
  } catch (error) {
    console.error(controller.signal.aborted ? 'Kubernetes smoke test interrupted.' : `FAIL: ${error.message}`);
    result = controller.signal.aborted ? 130 : 1;
  } finally {
    if (clusterReady) {
      await mkdir(resolve(artifacts, 'pods'), { recursive: true });
      for (const [filename, args] of [
        ['resources-final.json', ['get', 'deployments,pods,services,pvc,jobs', '-o', 'json']],
        ['events.log', ['get', 'events', '--sort-by=.metadata.creationTimestamp']],
      ]) {
        try { await writeFile(resolve(artifacts, filename), await cleanup([...kubectl, ...args], 30000, true)); }
        catch (error) { console.error(`Could not collect ${filename}: ${error.message}`); }
      }
      try {
        const pods = JSON.parse(await cleanup([...kubectl, 'get', 'pods', '-o', 'json'], 30000, true));
        for (const pod of pods.items) {
          for (const container of pod.spec.containers) {
            for (const previous of [false, ...(pod.status?.containerStatuses?.some(status => status.name === container.name && status.restartCount > 0) ? [true] : [])]) {
              try {
                const logs = await cleanup([...kubectl, 'logs', pod.metadata.name, '-c', container.name, '--timestamps=true', '--tail=1500', ...(previous ? ['--previous'] : [])], 30000, true);
                await writeFile(resolve(artifacts, 'pods', `${pod.metadata.name}.${container.name}${previous ? '.previous' : ''}.log`), logs);
              } catch (error) { console.error(`Could not collect logs for ${pod.metadata.name}: ${error.message}`); }
            }
          }
        }
      } catch (error) { console.error(`Could not enumerate pods: ${error.message}`); }
    }
    if (createAttempted) {
      try { await cleanup(['kind', 'export', 'logs', resolve(artifacts, 'kind'), '--name', cluster], 120000); }
      catch (error) { console.error(`Could not export kind logs: ${error.message}`); }
      try { await cleanup(['kind', 'delete', 'cluster', '--name', cluster, '--kubeconfig', kubeconfig], 120000); }
      catch (error) { console.error(`Cluster cleanup failed for ${cluster}: ${error.message}`); result ||= 1; }
    }
    if (buildAttempted) {
      try {
        const existing = (await cleanup(['docker', 'image', 'ls', '--format', '{{.Repository}}:{{.Tag}}'], 30000, true)).split('\n');
        const built = Object.values(images).filter(image => existing.includes(image));
        if (built.length) await cleanup(['docker', 'image', 'rm', ...built], 60000);
      } catch (error) { console.error(`Image cleanup failed for ${cluster}: ${error.message}`); result ||= 1; }
    }
    signals.removeListener('SIGINT', interrupt);
    signals.removeListener('SIGTERM', interrupt);
  }
  return controller.signal.aborted ? 130 : result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
