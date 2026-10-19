import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { alloyConfiguration } from './alloy.mjs';
import { check } from './check.mjs';

const source = await readFile(new URL('../../alloy/config.alloy', import.meta.url), 'utf8');

test('Kubernetes Alloy adapter retains pipelines and discovers each application pod', () => {
  const configured = alloyConfiguration(source);
  assert(configured.includes('targets = discovery.relabel.kubernetes_mythical.output'));
  assert(configured.includes('names = ["default"]'));
  assert(configured.includes('name in (mythical-server,mythical-requester)'));
  assert(configured.includes('replacement = "$1:4000"'));
  assert(configured.includes('replacement = "$1:4001"'));
  const originalTargets = source.match(/(prometheus\.scrape "mythical" \{[\s\S]*?\btargets\s*=\s*)(\[[\s\S]*?\])/)[2];
  const restored = configured.slice(0, configured.indexOf('\n// Test-cluster discovery'))
    .replace('discovery.relabel.kubernetes_mythical.output', originalTargets);
  assert.equal(restored, source);
});
for (const invalid of ['', 'prometheus.scrape "mythical" {}', source.replace('mythical-server:4000', 'other:4000')]) {
  test('changed Compose application scrape structure fails rather than silently using ClusterIP targets', () => {
    assert.throws(() => alloyConfiguration(invalid), /Expected the Compose/);
  });
}

const targets = () => [1, 2, 3].map(index => ({ metric: { instance: `10.0.0.${index}:4000` }, value: [123, '1'] }));
async function assertions(result, status = 'success') {
  let sharedRan = false;
  await check({ replicas: 3, smoke: async () => { sharedRan = true; },
    http: async url => {
      assert(sharedRan, 'Shared smoke assertions must run first');
      assert.equal(new URL(url).searchParams.get('query'), 'up{job="mythical",service="mythical-server"}');
      return JSON.stringify({ status, data: { result } });
    },
    wait: async (checks, timeout) => {
      assert.equal(timeout, 60000);
      for (const assertion of Object.values(checks)) await assertion();
    },
  });
}
test('all three distinct healthy scrape targets pass', () => assertions(targets()));
test('malformed Mimir JSON fails replica validation', async () => {
  await assert.rejects(check({ replicas: 3, smoke: async () => {}, http: async () => '{invalid',
    wait: async checks => { for (const assertion of Object.values(checks)) await assertion(); },
  }), SyntaxError);
});
for (const [name, result, status] of [
  ['missing replica', targets().slice(0, 2)],
  ['missing result', undefined],
  ['unhealthy scrape', targets().map(target => ({ ...target, value: [123, '0'] }))],
  ['duplicate instance', targets().map(target => ({ ...target, metric: { instance: 'shared:4000' } }))],
  ['missing instance', targets().map(target => ({ ...target, metric: {} }))],
  ['query error', targets(), 'error'],
]) {
  test(`${name} fails Kubernetes scrape coverage`, () => assert.rejects(assertions(result, status)));
}
for (const replicas of [null, 0, -1, 1.5, NaN]) {
  test('invalid expected replica count fails before shared smoke checks', () => assert.rejects(check({ replicas,
    smoke: async () => assert.fail('Shared checks should not run'),
  }), /positive integer/));
}
