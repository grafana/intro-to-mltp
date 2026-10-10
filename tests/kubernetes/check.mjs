import assert from 'node:assert/strict';
import { main, request, waitForChecks } from '../smoke/check.mjs';

export async function check({
  replicas = Number(process.env.EXPECTED_SERVER_REPLICAS),
  smoke = main, http = request, wait = waitForChecks,
} = {}) {
  assert(Number.isInteger(replicas) && replicas > 0, 'Expected server replica count must be a positive integer');
  await smoke();
  await wait({
    'All Kubernetes server replicas scraped': async () => {
      const query = encodeURIComponent('up{job="mythical",service="mythical-server"}');
      const payload = JSON.parse(await http(`http://mimir:9009/prometheus/api/v1/query?query=${query}`));
      assert.equal(payload.status, 'success', 'Mimir replica query failed');
      const targets = payload.data?.result;
      assert(Array.isArray(targets), 'Mimir replica query has no result array');
      assert.equal(targets.length, replicas, 'Alloy did not scrape every server replica');
      assert(targets.every(target => Number(target.value?.[1]) === 1), 'A server replica scrape is unhealthy');
      assert(targets.every(target => target.metric?.instance), 'A server replica has no instance label');
      assert.equal(new Set(targets.map(target => target.metric.instance)).size, replicas, 'Server replicas share a scrape instance');
    },
  }, 60000);
  console.log('PASS: Kubernetes smoke checks');
}
