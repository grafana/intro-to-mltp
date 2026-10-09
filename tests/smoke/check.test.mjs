import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChecks, request, waitForChecks, BEASTS, PROFILE_TYPE } from './check.mjs';

const metric = value => ({ status: 'success', data: { result: [{ value: [1, value] }] } });
const trace = service => ({ batches: [{
  resource: { attributes: [{ key: 'service.name', value: { stringValue: service } }] },
  scopeSpans: [{ spans: [{ name: 'GET' }] }],
}] });
const sources = (kind = 'grafana-pyroscope-datasource') => [
  { uid: 'mimir', type: 'prometheus', url: 'http://mimir:9009/prometheus' },
  { uid: 'loki', type: 'loki', url: 'http://loki:3100' },
  { uid: 'tempo', type: 'tempo', url: 'http://tempo:3200' },
  { uid: 'pyroscope', type: kind, url: 'http://pyroscope:4040' },
];
const dashboard = () => ({ dashboard: {
  panels: [{ id: 15, datasource: { uid: 'mimir', type: 'prometheus' }, targets: [{
    refId: 'A', instant: true, range: false,
    expr: 'sum(increase(traces_spanmetrics_calls_total{url_path=~"${httpEndpoint}"}[10m]))',
  }] }],
  templating: { list: [{ name: 'httpEndpoint', includeAll: true }] },
} });
const panelData = value => ({ results: { A: { status: 200, frames: [{
  schema: { fields: [{ type: 'string' }, { type: 'number' }] },
  data: { values: [['unicorn'], [value]] },
}] } } });
const fixture = (responses, options = {}) => {
  const calls = [];
  const checks = createChecks({
    log: () => {}, newId: () => 'a'.repeat(32), now: () => 2000, ...options,
    http: async (...args) => {
      calls.push(args);
      assert(responses.length, `Unexpected request: ${args[0]}`);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return typeof response === 'string' ? response : JSON.stringify(response);
    },
  });
  return { checks, calls };
};

test('HTTP wrong status fails with response details', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('broken', { status: 500 }));
  await assert.rejects(request('http://test', { method: 'POST', body: {}, status: 201 }), /expected 201, got 500: broken/);
});

test('HTTP expected error status is allowed', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('missing', { status: 404 }));
  assert.equal(await request('http://test', { status: 404 }), 'missing');
});

test('HTTP JSON body and timeout include Connect protocol headers', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  await request('http://test', { method: 'POST', body: { name: 'test' }, headers: { custom: 'value' } });
  const options = fetch.mock.calls[0].arguments[1];
  assert.equal(options.body, '{"name":"test"}');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.headers['Connect-Protocol-Version'], '1');
  assert.equal(options.headers.custom, 'value');
  assert(options.signal instanceof AbortSignal);
});

for (const value of ['0', 'NaN', 'Infinity', '-1']) {
  test(`non-positive or non-finite metric ${value} fails`, async () => {
    await assert.rejects(fixture([metric(value)]).checks.checkMetric('test'), /No positive sample/);
  });
}
test('empty metrics fail', async () => {
  await assert.rejects(fixture([{ status: 'success', data: { result: [] } }]).checks.checkMetric('test'), /No positive sample/);
});
test('positive metric passes', async () => { await fixture([metric('2')]).checks.checkMetric('test'); });
test('failed metrics query fails', async () => {
  await assert.rejects(fixture([{ status: 'error' }]).checks.checkMetric('test'), /Metrics query failed/);
});

for (const data of [{}, trace('another-service')]) {
  test('empty or unrelated trace fails', async () => {
    await assert.rejects(fixture([data]).checks.checkTrace('123'), /did not return server spans/);
  });
}
test('server trace passes', async () => { await fixture([trace('mythical-server')]).checks.checkTrace('123'); });
test('OTLP resourceSpans trace passes', async () => {
  await fixture([{ resourceSpans: trace('mythical-server').batches }]).checks.checkTrace('123');
});
for (const data of [{ series: [{ labels: [{ name: 'service_name', value: 'mythical-server' }] }] },
  { series: [{ points: [{ value: 0 }] }] }, { series: [] }]) {
  test('empty, metadata-only or zero profile fails', async () => {
    await assert.rejects(fixture([data]).checks.checkProfile('mythical-server', 0), /no positive CPU profile samples/);
  });
}
test('positive profiles pass with CPU profile type and selector', async () => {
  const { checks, calls } = fixture([{ series: [{ points: [{ value: 10 }] }] }]);
  await checks.checkProfile('mythical-server', 1000);
  assert.deepEqual(calls[0][1].body, {
    profileTypeID: PROFILE_TYPE, labelSelector: '{service_name="mythical-server"}',
    start: '1000', end: '2000', step: 10,
  });
});
test('unrelated log fails', async () => {
  const { checks } = fixture([{ status: 'success', data: { result: [{ values: [[1, 'startup']] }] } }]);
  await assert.rejects(checks.checkLog('123', 0), /did not receive the smoke request/);
});
test('smoke log passes with nanosecond query times', async () => {
  const { checks, calls } = fixture([{ status: 'success', data: { result: [{ values: [[1, 'traceID=123 status=SUCCESS']] }] } }]);
  await checks.checkLog('123', 1000);
  const url = new URL(calls[0][0]);
  assert.equal(url.searchParams.get('start'), '1000000000');
  assert.equal(url.searchParams.get('end'), '2000000000');
});

for (const response of [{ error: 'failed' }, [{ name: '' }], [{ name: '  ' }], [{}], [null]]) {
  test('invalid beast list or blank names fail', async () => {
    await assert.rejects(fixture([response]).checks.namesAt('http://test'), /expected (an array|rows with non-empty string names)/);
  });
}
test('empty lists are allowed for absence assertions', async () => {
  assert.deepEqual(await fixture([[]]).checks.namesAt('http://test'), []);
});
for (const beast of BEASTS) {
  test(`seeded ${beast} must appear through API and frontend proxy`, async () => {
    const name = 'smoke_' + 'a'.repeat(32);
    const { checks, calls } = fixture(['', [{ name }], [{ name }], '']);
    await checks.checkSeededBeast(beast);
    assert(calls[0][0].endsWith('/' + beast));
    assert.equal(calls[0][1].method, 'POST');
    assert.equal(calls[2][0], 'http://mythical-frontend/api/' + beast);
    assert.equal(calls[3][1].method, 'DELETE');
  });
}
for (const rows of [[], [{ name: 'unrelated' }]]) {
  test('empty or unrelated seeded list fails and deletes fixture', async () => {
    const { checks, calls } = fixture(['', rows, '']);
    await assert.rejects(checks.checkSeededBeast('beholder'), /missing seeded name/);
    assert.equal(calls.at(-1)[1].method, 'DELETE');
  });
}
test('empty seeded proxy list fails', async () => {
  const { checks } = fixture(['', [{ name: 'smoke_' + 'a'.repeat(32) }], [], '']);
  await assert.rejects(checks.checkSeededBeast('unicorn'), /missing seeded name/);
});
test('missing created row fails CRUD', async () => {
  await assert.rejects(fixture([[], '', []]).checks.checkCrud('http://test'), /POST did not persist/);
});
test('undeleted row fails CRUD', async () => {
  const row = [{ name: 'smoke_' + 'a'.repeat(32) }];
  await assert.rejects(fixture([[], '', row, row, '', row]).checks.checkCrud('http://test'), /DELETE did not remove/);
});
test('CRUD propagates unique trace context and verifies deletion and 404', async () => {
  const row = [{ name: 'smoke_' + 'a'.repeat(32) }];
  const { checks, calls } = fixture([[], '', row, row, '', [], '']);
  assert.equal(await checks.checkCrud('http://test'), 'a'.repeat(32));
  assert.equal(calls[3][1].headers.traceparent, `00-${'a'.repeat(32)}-${'a'.repeat(16)}-01`);
  assert.equal(calls.at(-1)[1].status, 404);
});
for (const kind of ['phlare', 'grafana-pyroscope-datasource']) {
  test(`Grafana provisioning accepts ${kind}`, async () => {
    await fixture([{ database: 'ok' }, sources(kind), dashboard()]).checks.checkGrafana();
  });
}
test('incorrect Grafana data source URL fails', async () => {
  const data = sources();
  data[0].url = 'http://wrong-host';
  await assert.rejects(fixture([{ database: 'ok' }, data]).checks.checkGrafana(), /Incorrect provisioned data source URLs/);
});
test('missing Grafana data source fails', async () => {
  await assert.rejects(fixture([{ database: 'ok' }, []]).checks.checkGrafana(), /Missing or incorrect/);
});
test('empty provisioned dashboard fails', async () => {
  await assert.rejects(fixture([{ database: 'ok' }, sources(), { dashboard: { panels: [] } }]).checks.checkGrafana(), /has no panels/);
});
test('frontend HTML instead of bundle fails', async () => {
  await assert.rejects(fixture(['<div id="root"></div><script src="/static/main.js"></script>', '<html>404</html>']).checks.checkFrontend(), /bundle is empty or HTML/);
});
test('frontend bundle from another host fails', async () => {
  await assert.rejects(fixture(['<div id="root"></div><script src="http://wrong/main.js"></script>']).checks.checkFrontend(), /Unexpected bundle URL/);
});
test('valid frontend bundle passes', async () => {
  await fixture(['<div id="root"></div><script src="/static/main.js"></script>', 'console.log("test")']).checks.checkFrontend();
});

test('all four telemetry checks query Grafana proxy URLs and require data', async () => {
  const { checks, calls } = fixture([
    metric('1'), { status: 'success', data: { result: [{ values: [[1, 'traceID=123 status=SUCCESS']] }] } },
    trace('mythical-server'), { series: [{ points: [{ value: 1 }] }] },
  ]);
  const proxy = uid => `http://grafana:3000/api/datasources/proxy/uid/${uid}`;
  await checks.checkMetric('test', proxy('mimir'));
  await checks.checkLog('123', 0, proxy('loki'));
  await checks.checkTrace('123', proxy('tempo'));
  await checks.checkProfile('mythical-server', 0, proxy('pyroscope'));
  assert(calls.every(([url]) => url.startsWith('http://grafana:3000/api/datasources/proxy/uid/')));
  assert.equal(calls[3][1].method, 'POST');
});
test('unreachable Grafana proxy fails instead of using the direct backend', async () => {
  const { checks, calls } = fixture([new Error('proxy unreachable')]);
  await assert.rejects(checks.checkMetric('test', 'http://grafana:3000/api/datasources/proxy/uid/mimir'), /proxy unreachable/);
  assert.equal(calls.length, 1);
});
test('MLT panel query uses the actual target, data source and interpolated variables', async () => {
  const { checks, calls } = fixture([dashboard(), panelData(2)]);
  await checks.checkDashboardPanel(1000);
  assert.equal(calls[1][0], 'http://grafana:3000/api/ds/query');
  assert.equal(calls[1][1].body.queries[0].expr, 'sum(increase(traces_spanmetrics_calls_total{url_path=~".*"}[10m]))');
  assert.equal(calls[1][1].body.queries[0].datasource.uid, 'mimir');
  assert.equal(calls[1][1].body.from, '1000');
});
test('wrong MLT panel metric is sent unchanged and empty data fails', async () => {
  const data = dashboard();
  data.dashboard.panels[0].targets[0].expr = 'nonexistent_metric';
  const { checks, calls } = fixture([data, { results: { A: { frames: [] } } }]);
  await assert.rejects(checks.checkDashboardPanel(0), /no positive numeric samples/);
  assert.equal(calls[1][1].body.queries[0].expr, 'nonexistent_metric');
});
for (const value of [0, null, '2', -1]) {
  test('MLT panel requires positive numeric frame data', async () => {
    await assert.rejects(fixture([dashboard(), panelData(value)]).checks.checkDashboardPanel(0), /no positive numeric samples/);
  });
}
for (const result of [{}, { results: { A: { error: 'bad query', status: 400 } } },
  { results: { A: { status: 500, frames: [] } } }]) {
  test('MLT panel query errors and missing results fail', async () => {
    await assert.rejects(fixture([dashboard(), result]).checks.checkDashboardPanel(0), /panel query failed/);
  });
}
test('wrong MLT panel data source fails', async () => {
  const data = dashboard();
  data.dashboard.panels[0].targets[0].datasource = { uid: 'wrong', type: 'prometheus' };
  await assert.rejects(fixture([data]).checks.checkDashboardPanel(0), /Incorrect MLT panel data source/);
});
test('missing MLT panel targets fail', async () => {
  await assert.rejects(fixture([{ dashboard: { panels: [] } }]).checks.checkDashboardPanel(0), /no visible query targets/);
});
test('unresolved MLT panel variables fail', async () => {
  const data = dashboard();
  data.dashboard.templating.list = [];
  await assert.rejects(fixture([data]).checks.checkDashboardPanel(0), /Unresolved MLT panel variable/);
});

test('retries eventually successful checks without repeating passed checks', async () => {
  let attempts = 0;
  let passed = 0;
  await waitForChecks({
    eventually: () => assert.equal(++attempts, 2, 'not yet'),
    passed: () => { passed++; },
  }, 10000, { pause: async () => {}, log: () => {} });
  assert.equal(attempts, 2);
  assert.equal(passed, 1);
});
test('timeout reports last failure for each pending check', async () => {
  await assert.rejects(waitForChecks({
    missing: () => { throw new Error('missing telemetry'); },
    other: () => { throw new Error('other failure'); },
  }, 0, { log: () => {} }), error => {
    assert.match(error.message, /missing telemetry/);
    assert.match(error.message, /other failure/);
    return true;
  });
});
