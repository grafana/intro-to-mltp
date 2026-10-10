// This Job runs before and after restarting the PostgreSQL deployment.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createChecks, request, waitForChecks } from '../smoke/check.mjs';

export async function persistence(mode, fixture, { checks = createChecks(), http = request, wait = waitForChecks } = {}) {
  assert(['seed', 'verify'].includes(mode), `Unknown persistence check: ${mode}`);
  assert(typeof fixture === 'string' && /^[a-z0-9_]{1,50}$/.test(fixture), 'A unique persistence fixture is required');
  const url = 'http://mythical-server:4000/unicorn';
  if (mode === 'seed') {
    await wait({ 'Persistence API ready': () => checks.namesAt(url) }, 180000);
    await http(url, { method: 'POST', body: { name: fixture }, status: 201 });
  }
  await wait({
    'Persistent beast name': async () => {
      assert((await checks.namesAt(url)).includes(fixture), `Database lost the persisted name ${fixture}`);
    },
  }, 180000);
  if (mode === 'verify') {
    await http(url, { method: 'DELETE', body: { name: fixture }, status: 204 });
    await wait({
      'Persistence fixture removed': async () => {
        assert(!(await checks.namesAt(url)).includes(fixture), 'Persistence fixture was not deleted');
      },
    }, 180000);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  persistence(process.argv[2], process.env.PERSISTENCE_NAME).then(() => {
    console.log('PASS: PostgreSQL persistence ' + process.argv[2]);
  }).catch(error => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
