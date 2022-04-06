const tracingUtils = require('./tracing')('requester', 'mythical-requester');
const { api, tracer, propagator } = tracingUtils;
const request = require('request-promise-native');
const { uniqueNamesGenerator, adjectives, colors } = require('unique-names-generator');
const logEntry = require('./logging')('mythical-requester', 'requester');
const express = require('express');
const promClient = require('prom-client');
const { nameSet, servicePrefix, spanTag, accumulators }  = require('./endpoints')();

// Prometheus client registration
const app = express();
const register = promClient.register;
register.setContentType(promClient.Registry.OPENMETRICS_CONTENT_TYPE);

// Status response bucket (histogram)
const dangerGauge = new promClient.Gauge({
    name: 'mythical_danger_level_30s',
    help: 'Recent accumulated danger level over the past 30 seconds',
});

// Metrics endpoint handler (for Prometheus scraping)
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
});

// We just keep going, requesting names and adding them
const makeRequest = async () => {
    const type = (Math.floor(Math.random() * 100) < 50) ? 'GET' : 'POST';
    const index = Math.floor(Math.random() * nameSet.length);
    const endpoint = nameSet[index];
    const dangerLevel = accumulators[index];
    let headers = {};
    let error = false;

    // Create a new span
    const requestSpan = tracer.startSpan("requester", { kind: api.SpanKind.CLIENT });
    requestSpan.setAttribute(spanTag, endpoint);
    const { traceId } = requestSpan.spanContext();

    // Increment the danger level on the gauge
    dangerGauge.inc(dangerLevel);

    // Create a new context for this request
    api.context.with(api.trace.setSpan(api.context.active(), requestSpan), async () => {
        const start = Date.now();
        // Add the headers required for trace propagation
        headers = propagator(requestSpan);

        if (type === 'GET') {
            let names;
            try {
                const result = await request({
                    method: 'GET',
                    uri: `http://mythical-server:4000/${endpoint}`,
                    headers
                });
                logEntry({
                    level: 'info',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-requester`,
                    endpointLabel: spanTag,
                    endpoint,
                    message: `traceID=${traceId} http.method=GET endpoint=${endpoint}" status=SUCCESS`,
                });
                names = JSON.parse(result);

                // Deletion probabilty is based on the array index.
                let delProb = (index / nameSet.length) * 100;
                if (Math.floor(Math.random() * 100) < delProb) {
                    if (names.length > 0) {
                        await request({
                            method: 'DELETE',
                            uri: `http://mythical-server:4000/${endpoint}`,
                            json: true,
                            headers,
                            body: { name: names[0].name },
                        });
                        logEntry({
                            level: 'info',
                            namespace: process.env.NAMESPACE,
                            job: `${servicePrefix}-requester`,
                            endpointLabel: spanTag,
                            endpoint,
                            message: `traceID=${traceId} http.method=DELETE endpoint=${endpoint}" status=SUCCESS`,
                        });
                    }
                }
            } catch (err) {
                logEntry({
                    level: 'error',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-requester`,
                    endpointLabel: spanTag,
                    endpoint,
                    message: `traceID=${traceId} http.method=DELETE endpoint=${endpoint} name=${(names) ? names[0].name : "unknown"} status=FAILURE error=${err}`,
                });
                console.log('Requester error');
                error = true;
            }
        } else {
            // Generate new name
            const randomName = uniqueNamesGenerator({ dictionaries: [adjectives, colors, adjectives] });
            const body = (Math.random() < 0.1) ? { whoops: "yes" } : { name : randomName };

            try {
                await request({
                    method: 'POST',
                    uri: `http://mythical-server:4000/${endpoint}`,
                    json: true,
                    headers,
                    body,
                });
                logEntry({
                    level: 'info',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-requester`,
                    endpointLabel: spanTag,
                    endpoint,
                    message: `traceID=${traceId} http.method=POST endpoint=${endpoint} status=SUCCESS`,
                });
            } catch (err) {
                logEntry({
                    level: 'error',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-requester`,
                    endpointLabel: spanTag,
                    endpoint,
                    message: `traceID=${traceId} http.method=POST endpoint=${endpoint} name=${randomName} status=FAILURE error=${err}`,
                });
                console.log('Requester error');
                error = true;
            }

        }
        logEntry({
            level: 'info',
            namespace: process.env.NAMESPACE,
            job: `${servicePrefix}-requester`,
            endpointLabel: spanTag,
            endpoint,
            message: `traceID=${traceId} http.method=${type} endpoint=${endpoint} duration=${Date.now() - start}ms`,
        });

        // Set the status code as OK and end the span
        requestSpan.setStatus({ code: (!error) ? api.SpanStatusCode.OK : api.SpanStatusCode.ERROR });
        requestSpan.end();
    });

    // Sometime in the next two seconds, but larger than 100ms
    const nextReqIn = (Math.random() * 1000) + 100;
    setTimeout(() => makeRequest(), nextReqIn);
};

// Kick off four requests that cycle at regular intervals
setTimeout(() => makeRequest(), 5000);
setTimeout(() => makeRequest(), 6000);
setTimeout(() => makeRequest(), 7000);
setTimeout(() => makeRequest(), 8000);

// Ensure the danger gauge gets reset every minute
setInterval(() => {
    dangerGauge.set(0);
}, 30000);

// Listen to API connections for metrics scraping.
app.listen(4001);
