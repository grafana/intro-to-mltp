// Build an isolated stack, collect diagnostics, and remove its resources.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APPLICATIONS = [
  'mythical-server', 'mythical-requester', 'mythical-recorder', 'mythical-frontend',
];

export function requireComposeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match || Number(match[1]) < 2 || (Number(match[1]) === 2 && Number(match[2]) < 24)) {
    throw new Error(`Docker Compose 2.24.0 or newer is required for ports: !reset []; found ${version.trim() || 'an unknown version'}`);
  }
}

export function command(args, { env, timeout, capture = false, signal }) {
  console.log('+ ' + args.join(' '));
  return new Promise((resolveCommand, reject) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: ROOT, env, signal, stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    });
    let output = '';
    if (capture) child.stdout.setEncoding('utf8').on('data', data => { output += data; });
    let timedOut = false;
    let killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      clearTimeout(killTimer);
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeout);
    // AbortSignal sends SIGTERM. Bound cancellation even if Docker ignores it.
    const forceKill = () => {
      clearTimeout(killTimer);
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    };
    signal?.addEventListener('abort', forceKill, { once: true });
    let spawnError;
    child.on('error', error => { spawnError = error; });
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', forceKill);
      if (spawnError || timedOut || code !== 0) {
        reject(spawnError ?? new Error(`${args.join(' ')}: ${timedOut ? 'timed out' : `exit ${code ?? exitSignal}`}`));
      } else {
        resolveCommand(output);
      }
    });
  });
}

export async function run({ execute = command, environment = process.env, signals = process } = {}) {
  const project = 'mltp-smoke-' + randomUUID().replaceAll('-', '').slice(0, 12);
  const env = { ...environment, COMPOSE_PROJECT_NAME: project, COMPOSE_PROFILES: '' };
  const artifacts = resolve(env.SMOKE_ARTIFACT_DIR ?? resolve(ROOT, 'tests/artifacts', project));
  await mkdir(artifacts, { recursive: true });
  const compose = [
    'docker', 'compose', '--project-name', project,
    '-f', resolve(ROOT, 'docker-compose.yml'),
    '-f', resolve(ROOT, 'tests/smoke/compose.yml'),
  ];
  const images = APPLICATIONS.map(service => `${project}-${service.replace('mythical-', '')}:smoke`);
  console.log(`Project: ${project}\nDiagnostics: ${artifacts}`);
  let result = 0;
  let started = false;
  let buildAttempted = false;
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  signals.on('SIGTERM', interrupt);
  signals.on('SIGINT', interrupt);
  const work = (args, timeout, capture = false) => execute(args, {
    env, timeout, capture, signal: controller.signal,
  });
  const cleanup = (args, timeout, capture = false) => execute(args, { env, timeout, capture });
  try {
    // Check before parsing the overlay: old Compose cannot understand !reset.
    requireComposeVersion(await work(['docker', 'compose', 'version', '--short'], 30000, true));
    const config = await work([...compose, '--profile', 'test', 'config', '--format', 'json'], 30000, true);
    await writeFile(resolve(artifacts, 'compose.json'), config);
    buildAttempted = true;
    await work([...compose, 'build', ...APPLICATIONS], 900000);
    await work([...compose, '--profile', 'test', 'pull', '--ignore-buildable'], 600000);
    started = true;
    await work([...compose, 'up', '-d', '--no-build', '--pull', 'never'], 180000);
    // Allow all three retry windows plus bounded API calls to finish.
    await work([...compose, 'run', '--rm', '--no-deps', '-T', 'smoke'], 720000);
  } catch (error) {
    console.error(controller.signal.aborted ? 'Smoke test interrupted.' : `FAIL: ${error.message}`);
    result = controller.signal.aborted ? 130 : 1;
  } finally {
    if (started) {
      for (const [filename, args] of [
        ['containers.json', ['ps', '--all', '--format', 'json']],
        ['compose.log', ['logs', '--no-color', '--timestamps']],
      ]) {
        try {
          await writeFile(resolve(artifacts, filename), await cleanup([...compose, ...args], 60000, true));
        } catch (error) {
          console.error(`Could not collect ${filename}: ${error.message}`);
        }
      }
      try {
        await cleanup([...compose, 'down', '--volumes', '--remove-orphans', '--timeout', '10'], 120000);
      } catch (error) {
        console.error(`Cleanup failed for ${project}: ${error.message}`);
        result ||= 1;
      }
    }
    if (buildAttempted) {
      try {
        // A partial build can leave fewer than four tags. Remove only tags from
        // this run, without forcing removal or touching shared backend images.
        const existing = (await cleanup(['docker', 'image', 'ls', '--format', '{{.Repository}}:{{.Tag}}'], 30000, true)).split('\n');
        const built = images.filter(image => existing.includes(image));
        if (built.length) await cleanup(['docker', 'image', 'rm', ...built], 60000);
      } catch (error) {
        console.error(`Image cleanup failed for ${project}: ${error.message}`);
        result ||= 1;
      }
    }
    signals.removeListener('SIGTERM', interrupt);
    signals.removeListener('SIGINT', interrupt);
  }
  return controller.signal.aborted ? 130 : result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
