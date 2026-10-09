// HTTP assertions against the demo stack, using only Node.js built-ins.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BEASTS = ['unicorn', 'manticore', 'illithid', 'owlbear', 'beholder'];
const SERVICES = ['mythical-server', 'mythical-requester', 'mythical-recorder'];
// The Node SDK's wall profiler emits CPU samples when collectCpuTime is enabled.
export const PROFILE_TYPE = 'wall:cpu:nanoseconds:wall:nanoseconds';
const GRAFANA = 'http://grafana:3000';
const DASHBOARD_UID = 'ed4f4709-4d3b-48fd-a311-a036b85dbd5b';

export async function request(url, { method = 'GET', body, headers = {}, status = 200 } = {}) {
  if (body !== undefined) {
    headers = { ...headers, 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1' };
  }
  const response = await fetch(url, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${url}: expected ${status}, got ${response.status}: ${text.slice(0, 500)}`);
  return text;
}

export async function waitForChecks(checks, timeout, {
  now = () => performance.now(), pause = sleep, log = console.log,
} = {}) {
  const pending = new Map(Object.entries(checks));
  const errors = new Map();
  const deadline = now() + timeout;
  while (pending.size) {
    await Promise.all([...pending].map(async ([name, check]) => {
      try {
        await check();
        log(`PASS: ${name}`);
        pending.delete(name);
      } catch (error) {
        errors.set(name, `${error.name}: ${error.message}`);
      }
    }));
    if (!pending.size) return;
    const remaining = deadline - now();
    assert(remaining > 0, `Timed out after ${timeout / 1000}s:\n${[...pending.keys()].map(name => `  ${name}: ${errors.get(name)}`).join('\n')}`);
    log('Waiting for: ' + [...pending.keys()].join(', '));
    await pause(Math.min(5000, remaining));
  }
}

const withQuery = (url, params) => url + '?' + new URLSearchParams(params);
const id = () => randomBytes(16).toString('hex');

export function createChecks({ http = request, now = Date.now, newId = id, log = console.log } = {}) {
  const getJson = async (url, options) => JSON.parse(await http(url, options));

  async function namesAt(url, options) {
    const rows = await getJson(url, options);
    assert(Array.isArray(rows), `${url}: expected an array, got ${JSON.stringify(rows)}`);
    assert(rows.every(row => row && typeof row.name === 'string' && row.name.trim()),
      `${url}: expected rows with non-empty string names, got ${JSON.stringify(rows)}`);
    return rows.map(row => row.name);
  }

  async function checkSeededBeast(beast) {
    const direct = `http://mythical-server:4000/${beast}`;
    const proxy = `http://mythical-frontend/api/${beast}`;
    const name = 'smoke_' + newId();
    await http(direct, { method: 'POST', body: { name }, status: 201 });
    try {
      for (const url of [direct, proxy]) {
        const names = await namesAt(url);
        assert(names.length > 0 && names.includes(name), `${url}: missing seeded name ${name}`);
      }
    } finally {
      await http(direct, { method: 'DELETE', body: { name }, status: 204 });
    }
  }

  async function checkCrud(baseUrl) {
    // The requester never deletes unicorns, so background traffic cannot erase
    // this fixture. A fresh name keeps other requester traffic out of the check.
    const url = baseUrl + '/unicorn';
    const name = 'smoke_' + newId();
    const body = { name };
    assert(!(await namesAt(url)).includes(name), 'Smoke fixture already exists');
    await http(url, { method: 'POST', body, status: 201 });
    assert.equal((await namesAt(url)).filter(item => item === name).length, 1, `POST did not persist exactly one ${name}`);
    const traceId = newId();
    const spanId = newId().slice(0, 16);
    assert((await namesAt(url, { headers: { traceparent: `00-${traceId}-${spanId}-01` } })).includes(name), `GET lost ${name}`);
    await http(url, { method: 'DELETE', body, status: 204 });
    assert(!(await namesAt(url)).includes(name), `DELETE did not remove ${name}`);
    await http(baseUrl + '/not-a-beast', { status: 404 });
    log(`PASS: CRUD through ${baseUrl}`);
    return traceId;
  }

  async function checkFrontend() {
    const base = 'http://mythical-frontend';
    const html = await http(base + '/');
    assert(html.includes('id="root"'), 'Frontend HTML does not contain the React root');
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(match => match[1]);
    assert(scripts.length, 'Frontend HTML does not reference a JavaScript bundle');
    for (const script of scripts) {
      const url = new URL(script, base + '/');
      assert.equal(url.host, 'mythical-frontend', `Unexpected bundle URL: ${url}`);
      const content = await http(url.href);
      assert(content.trim() && !content.trimStart().startsWith('<'), `Frontend bundle is empty or HTML: ${script}`);
    }
  }

  async function checkGrafana() {
    const health = await getJson(GRAFANA + '/api/health');
    assert.equal(health.database, 'ok', `Grafana database is not ready: ${JSON.stringify(health)}`);
    const sources = await getJson(GRAFANA + '/api/datasources');
    const expected = {
      mimir: ['prometheus'], loki: ['loki'], tempo: ['tempo'],
      // Grafana migrates the historical phlare identifier during provisioning.
      pyroscope: ['phlare', 'grafana-pyroscope-datasource'],
    };
    assert(Object.entries(expected).every(([uid, kinds]) => sources.some(source => source.uid === uid && kinds.includes(source.type))),
      `Missing or incorrect provisioned data sources: ${JSON.stringify(sources)}`);
    const urls = {
      mimir: 'http://mimir:9009/prometheus', loki: 'http://loki:3100',
      tempo: 'http://tempo:3200', pyroscope: 'http://pyroscope:4040',
    };
    assert(Object.entries(urls).every(([uid, url]) => sources.some(source => source.uid === uid && source.url?.replace(/\/$/, '') === url)),
      `Incorrect provisioned data source URLs: ${JSON.stringify(sources)}`);
    const { dashboard } = await getJson(GRAFANA + '/api/dashboards/uid/' + DASHBOARD_UID);
    assert(dashboard?.panels?.length, 'MLT dashboard has no panels');
  }

  async function checkMetric(query, base = 'http://mimir:9009/prometheus') {
    const result = await getJson(withQuery(base + '/api/v1/query', { query }));
    assert.equal(result.status, 'success', `Metrics query failed: ${JSON.stringify(result)}`);
    const rows = result.data?.result ?? [];
    assert(rows.some(row => Number.isFinite(Number(row.value?.[1])) && Number(row.value[1]) > 0), `No positive sample for ${query}: ${JSON.stringify(rows)}`);
  }

  async function checkRecording() {
    const text = await http('http://mythical-recorder:4002/metrics');
    const samples = [...text.matchAll(/^mythical_messages_recorded(?:_total)?\s+([0-9.eE+-]+)/gm)];
    assert(samples.some(match => Number(match[1]) > 0), 'Recorder did not consume any queue messages');
  }

  async function checkLog(traceId, start, base = 'http://loki:3100') {
    const query = '{service_name="mythical-server"} |= "traceID=' + traceId + '"';
    const result = await getJson(withQuery(base + '/loki/api/v1/query_range', {
      query, start: `${start}000000`, end: `${now()}000000`, limit: 10,
    }));
    assert.equal(result.status, 'success', `Loki query failed: ${JSON.stringify(result)}`);
    const lines = (result.data?.result ?? []).flatMap(stream => (stream.values ?? []).map(([, line]) => line));
    assert(lines.some(line => line.includes(`traceID=${traceId}`) && line.includes('status=SUCCESS')), `Loki did not receive the smoke request log for ${traceId}`);
  }

  async function checkTrace(traceId, base = 'http://tempo:3200') {
    const trace = await getJson(`${base}/api/traces/${traceId}`, { headers: { Accept: 'application/json' } });
    // Tempo's JSON uses batches for the OTLP ResourceSpans field.
    const batches = trace.batches ?? trace.resourceSpans ?? [];
    assert(batches.some(batch => {
      const server = (batch.resource?.attributes ?? []).some(attr => attr.key === 'service.name' && attr.value?.stringValue === 'mythical-server');
      const scopes = batch.scopeSpans ?? batch.instrumentationLibrarySpans ?? [];
      return server && scopes.some(scope => scope.spans?.length);
    }), `Tempo did not return server spans for the smoke trace ${traceId}`);
  }

  async function checkServiceTrace(service, start) {
    const result = await getJson(withQuery('http://tempo:3200/api/search', {
      q: `{ resource.service.name = "${service}" }`,
      start: Math.floor(start / 1000), end: Math.floor(now() / 1000), limit: 1,
    }));
    assert(result.traces?.length, `Tempo has no traces from ${service}`);
  }

  async function checkProfile(service, start, base = 'http://pyroscope:4040') {
    const result = await getJson(base + '/querier.v1.QuerierService/SelectSeries', {
      method: 'POST', body: {
        profileTypeID: PROFILE_TYPE, labelSelector: `{service_name="${service}"}`,
        start: String(start), end: String(now()), step: 10,
      },
    });
    const points = (result.series ?? []).flatMap(series => series.points ?? []);
    assert(points.some(point => Number.isFinite(Number(point.value)) && Number(point.value) > 0), `Pyroscope has no positive CPU profile samples from ${service}`);
  }

  async function checkDashboardPanel(start) {
    const { dashboard } = await getJson(GRAFANA + '/api/dashboards/uid/' + DASHBOARD_UID);
    // Execute the provisioned HTTP status panel, not a replacement test query.
    // It uses span metrics and should have positive values for smoke traffic.
    const panel = dashboard?.panels?.find(panel => panel.id === 15);
    const targets = panel?.targets?.filter(target => !target.hide);
    assert(targets?.length, 'MLT HTTP status panel has no visible query targets');
    const variables = Object.fromEntries((dashboard.templating?.list ?? [])
      .filter(variable => variable.includeAll).map(variable => [variable.name, variable.allValue || '.*']));
    const queries = targets.map(target => {
      const datasource = target.datasource ?? panel.datasource;
      assert(datasource?.uid === 'mimir' && datasource.type === 'prometheus', `Incorrect MLT panel data source: ${JSON.stringify(datasource)}`);
      assert(typeof target.expr === 'string' && target.expr.trim(), 'MLT panel has no PromQL expression');
      const expr = target.expr.replace(/\$\{(\w+)\}/g, (match, name) => variables[name] ?? match);
      assert(!expr.includes('$'), `Unresolved MLT panel variable in ${expr}`);
      return { ...target, datasource, expr, intervalMs: 2000, maxDataPoints: 300 };
    });
    const result = await getJson(GRAFANA + '/api/ds/query', {
      method: 'POST', body: { from: String(start), to: String(now()), queries },
    });
    for (const query of queries) {
      const data = result.results?.[query.refId];
      assert(data && !data.error && (data.status === undefined || data.status === 200), `Grafana panel query failed: ${JSON.stringify(result)}`);
      assert(data.frames?.some(frame => frame.schema?.fields?.some((field, index) =>
        field.type === 'number' && frame.data?.values?.[index]?.some(value =>
          typeof value === 'number' && Number.isFinite(value) && value > 0))),
      `MLT panel ${panel.id}/${query.refId} returned no positive numeric samples`);
    }
  }

  return {
    namesAt, checkSeededBeast, checkCrud, checkFrontend, checkGrafana, checkMetric,
    checkRecording, checkLog, checkTrace, checkServiceTrace, checkProfile, checkDashboardPanel,
  };
}

export async function main() {
  const start = Date.now();
  const checks = createChecks();
  const endpoints = {
    'Alloy ready': 'http://alloy:12345/-/ready', 'Mimir ready': 'http://mimir:9009/ready',
    'Loki ready': 'http://loki:3100/ready', 'Tempo ready': 'http://tempo:3200/ready',
    'Pyroscope ready': 'http://pyroscope:4040/ready',
  };
  const readiness = Object.fromEntries(Object.entries(endpoints).map(([name, url]) => [name, () => request(url)]));
  Object.assign(readiness, {
    'API ready': () => checks.namesAt('http://mythical-server:4000/unicorn'),
    'Frontend bundles': checks.checkFrontend, 'Grafana provisioning': checks.checkGrafana,
  });
  await waitForChecks(readiness, 180000);
  // Retry a whole seed/read/delete transaction if background requester traffic
  // deletes a seed. Empty or unrelated lists can never pass the assertion.
  await waitForChecks(Object.fromEntries(BEASTS.map(beast => [
    `Seeded ${beast} lists through API and proxy`, () => checks.checkSeededBeast(beast),
  ])), 180000);
  const traceId = await checks.checkCrud('http://mythical-server:4000');
  const proxyTraceId = await checks.checkCrud('http://mythical-frontend/api');
  const proxy = uid => `${GRAFANA}/api/datasources/proxy/uid/${uid}`;
  const telemetry = {
    'Mimir requester metrics': () => checks.checkMetric('mythical_danger_level_30s'),
    'Tempo span metrics in Mimir': () => checks.checkMetric('traces_spanmetrics_calls_total{service="mythical-server"}'),
    'Queue consumption': checks.checkRecording,
    'Smoke log in Loki': () => checks.checkLog(traceId, start),
    'Smoke trace in Tempo': () => checks.checkTrace(traceId),
    'Frontend proxy trace in Tempo': () => checks.checkTrace(proxyTraceId),
    'Grafana Mimir proxy query': () => checks.checkMetric('mythical_danger_level_30s', proxy('mimir')),
    'Grafana Loki proxy query': () => checks.checkLog(traceId, start, proxy('loki')),
    'Grafana Tempo proxy query': () => checks.checkTrace(traceId, proxy('tempo')),
    'Grafana Pyroscope proxy query': () => checks.checkProfile('mythical-server', start, proxy('pyroscope')),
    'Grafana MLT panel query': () => checks.checkDashboardPanel(start),
  };
  for (const [method, status] of [['GET', '200'], ['POST', '201'], ['DELETE', '204']]) {
    telemetry[`Mimir ${method} metrics`] = () => checks.checkMetric(`mythical_request_times_count{beast="unicorn",method="${method}",status="${status}"}`);
  }
  for (const service of SERVICES) telemetry[`CPU profiles: ${service}`] = () => checks.checkProfile(service, start);
  for (const service of SERVICES.slice(1)) telemetry[`Traces: ${service}`] = () => checks.checkServiceTrace(service, start);
  await waitForChecks(telemetry, 180000);
  console.log('PASS: stack smoke test');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`FAIL: ${error.name}: ${error.message}`);
    process.exitCode = 1;
  });
}
