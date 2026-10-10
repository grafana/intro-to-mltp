import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitForPodReplacement } from './run.mjs';

function pod(uid, { ready = true, phase = 'Running', deleting = false } = {}) {
  return {
    metadata: { uid, name: `database-${uid}`, ...(deleting ? { deletionTimestamp: '2026-01-01T00:00:00Z' } : {}) },
    status: { phase, conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] },
  };
}

function polling(snapshots, { timeout = 2500, interval = 1000, signal } = {}) {
  let clock = 0;
  let reads = 0;
  const queryTimeouts = [];
  const delays = [];
  const pods = async budget => {
    queryTimeouts.push(budget);
    return { items: snapshots[Math.min(reads++, snapshots.length - 1)] };
  };
  const options = {
    timeout, interval, signal, now: () => clock,
    pause: async (delay, value, options) => {
      assert.equal(value, undefined);
      assert.equal(options.signal, signal);
      delays.push(delay);
      clock += delay;
    },
  };
  return { pods, options, queryTimeouts, delays, reads: () => reads };
}
const oldPods = () => new Set(['old']);

test('ready replacement with a new UID passes without a delay', async () => {
  const setup = polling([[pod('new')]]);
  assert.deepEqual(await waitForPodReplacement(setup.pods, oldPods(), setup.options), [pod('new')]);
  assert.equal(setup.reads(), 1);
  assert.deepEqual(setup.delays, []);
});

test('CI race: stopped old pod remains listed beside a ready replacement', async () => {
  const old = pod('old', { ready: false, phase: 'Succeeded', deleting: true });
  const replacement = pod('new');
  const setup = polling([[old, replacement], [old, replacement], [replacement]]);
  assert.deepEqual(await waitForPodReplacement(setup.pods, oldPods(), setup.options), [replacement]);
  assert.equal(setup.reads(), 3);
  assert.deepEqual(setup.delays, [1000, 1000]);
});

test('replacement wait handles an empty list and a not-yet-ready new pod', async () => {
  const setup = polling([[], [pod('new', { ready: false })], [pod('new')]]);
  await waitForPodReplacement(setup.pods, oldPods(), setup.options);
  assert.equal(setup.reads(), 3);
});

for (const [name, pods] of [
  ['old UID still present', [pod('old')]],
  ['old terminal object still present', [pod('old', { phase: 'Succeeded', deleting: true }), pod('new')]],
  ['no pods', []],
  ['replacement not ready', [pod('new', { ready: false })]],
  ['replacement terminating', [pod('new', { deleting: true })]],
  ['replacement not running', [pod('new', { phase: 'Succeeded' })]],
  ['missing readiness', [{ metadata: { uid: 'new' }, status: { phase: 'Running' } }]],
  ['one of several new pods unready', [pod('new'), pod('other', { ready: false })]],
]) {
  test(`${name} cannot pass and produces a bounded timeout`, async () => {
    const setup = polling([pods]);
    await assert.rejects(waitForPodReplacement(setup.pods, oldPods(), setup.options), /Database pod replacement timed out after 2.5s; remaining pods:/);
    assert.equal(setup.reads(), 3);
    assert.deepEqual(setup.delays, [1000, 1000, 500]);
    assert.deepEqual(setup.queryTimeouts, [2500, 1500, 500]);
  });
}

test('each Kubernetes query is capped at 30 seconds', async () => {
  const setup = polling([[pod('new')]], { timeout: 40000 });
  await waitForPodReplacement(setup.pods, oldPods(), setup.options);
  assert.deepEqual(setup.queryTimeouts, [30000]);
});

for (const resources of [null, {}, { items: null }, { items: {} }, { items: [null] }, { items: [{}] }, { items: [{ metadata: { uid: '' } }] }]) {
  test('malformed pod list fails without retrying or producing a false pass', async () => {
    await assert.rejects(waitForPodReplacement(async () => resources, oldPods(), {
      pause: async () => assert.fail('Malformed state must not be retried'),
    }), /Database pod list has no items array|Database pod has no UID/);
  });
}

for (const original of [new Set(), new Set([undefined]), new Set(['']), ['old']]) {
  test('invalid original pod identities fail without querying Kubernetes', async () => {
    await assert.rejects(waitForPodReplacement(async () => assert.fail('Query must not run'), original), /Expected original database pod UIDs/);
  });
}
for (const options of [{ timeout: 0 }, { timeout: NaN }, { interval: -1 }, { interval: Infinity }]) {
  test('invalid timeout or interval fails without querying Kubernetes', async () => {
    await assert.rejects(waitForPodReplacement(async () => assert.fail('Query must not run'), oldPods(), options), /must be positive/);
  });
}

test('Kubernetes query failure propagates immediately', async () => {
  await assert.rejects(waitForPodReplacement(async () => { throw new Error('kubectl unavailable'); }, oldPods()), /kubectl unavailable/);
});

test('already aborted replacement wait does not query Kubernetes', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitForPodReplacement(async () => assert.fail('Query must not run'), oldPods(), {
    signal: controller.signal,
  }), { name: 'AbortError' });
});
test('cancellation while querying prevents accepting a ready replacement', async () => {
  const controller = new AbortController();
  await assert.rejects(waitForPodReplacement(async () => {
    controller.abort();
    return { items: [pod('new')] };
  }, oldPods(), { signal: controller.signal }), { name: 'AbortError' });
});
test('replacement sleep receives the abort signal and stops polling', async () => {
  const controller = new AbortController();
  let reads = 0;
  await assert.rejects(waitForPodReplacement(async () => {
    reads++;
    return { items: [pod('old')] };
  }, oldPods(), {
    signal: controller.signal,
    pause: async (delay, value, { signal }) => {
      assert(delay > 0);
      assert.equal(signal, controller.signal);
      controller.abort();
      signal.throwIfAborted();
    },
  }), { name: 'AbortError' });
  assert.equal(reads, 1);
});
