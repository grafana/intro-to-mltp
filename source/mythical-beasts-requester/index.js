const tracingUtils = require('./tracing')('requester', 'mythical-requester');
const Pyroscope = require('@pyroscope/nodejs');
const { expressMiddleware } = require('@pyroscope/nodejs');
const axios = require('axios');
const { uniqueNamesGenerator, names, colors, animals } = require('unique-names-generator');
const logUtils = require('./logging')('mythical-requester', 'requester');
const express = require('express');
const promClient = require('prom-client');
const { nameSet, servicePrefix, spanTag, accumulators }  = require('./endpoints')();
const queueUtils = require('./queue')();

// Prometheus client registration
const app = express();
const register = promClient.register;
register.setContentType(promClient.Registry.OPENMETRICS_CONTENT_TYPE);

let logEntry;

// What a horrible thing to do, global span context for linking.
// You would not do this in production code, you'd use propagation and baggage.
let previousReqSpanContext;

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

// Initialise the Pyroscope library to send pprof data.
Pyroscope.init({
    appName: 'mythical-beasts-requester',
});
app.use(expressMiddleware());

// We just keep going, requesting names and adding them
const makeRequest = async (tracingObj, sendMessage, logEntry) => {
    const { api, tracer, propagator } = tracingObj;
    const type = (Math.floor(Math.random() * 100) < 50) ? 'GET' : 'POST';
    const index = Math.floor(Math.random() * nameSet.length);
    const endpoint = nameSet[index];
    const dangerLevel = accumulators[index];
    let headers = {};
    let error = false;

    // Create a new span, link to previous request to show how linking between traces works.
    const requestSpan = tracer.startSpan('requester', {
        kind: api.SpanKind.CLIENT,
        links: (previousReqSpanContext) ? [{ context: previousReqSpanContext }] : undefined,
    });
    requestSpan.setAttribute(spanTag, endpoint);
    requestSpan.setAttribute(`http.target`, '/' + endpoint);
    requestSpan.setAttribute(`http.method`, type);
    requestSpan.setAttribute('service.version', (Math.floor(Math.random() * 100)) < 50 ? '1.9.2' : '2.0.0');
    previousReqSpanContext = requestSpan.spanContext();
    const { traceId } = requestSpan.spanContext();

    // Increment the danger level on the gauge
    dangerGauge.inc(dangerLevel);

    let serverHostPort = "mythical-server:4000"
    // check env var for override
    if (process.env.MYTHICAL_SERVER_HOST_PORT) {
        serverHostPort = process.env.MYTHICAL_SERVER_HOST_PORT
    }

    // Create a new context for this request
    api.context.with(api.trace.setSpan(api.context.active(), requestSpan), async () => {
        const start = Date.now();
        // Add the headers required for trace propagation
        headers = propagator(requestSpan);

        if (type === 'GET') {
            let names;
            try {
                const result = await axios.get(`http://${serverHostPort}/${endpoint}`, { headers });
                sendMessage(`GET /${endpoint}`);
                logEntry({
                    level: 'info',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-requester`,
                    endpointLabel: spanTag,
                    endpoint,
                    message: `traceID=${traceId} http.method=GET endpoint=${endpoint} status=SUCCESS`,
                });
                names = result.data;

                // Deletion probabilty is based on the array index.
                let delProb = (index / nameSet.length) * 100;
                if (Math.floor(Math.random() * 100) < delProb) {
                    if (names.length > 0) {
                        await axios.delete(`http://${serverHostPort}/${endpoint}`, { name: names[0].name },
                            { headers });
                        sendMessage(`DELETE /${endpoint} ${names[0].name}`);
                        logEntry({
                            level: 'info',
                            namespace: process.env.NAMESPACE,
                            job: `${servicePrefix}-requester`,
                            endpointLabel: spanTag,
                            endpoint,
                            message: `traceID=${traceId} http.method=DELETE endpoint=${endpoint} status=SUCCESS`,
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
                    message: `traceID=${traceId} http.method=DELETE endpoint=${endpoint} ` +
                        `name=${(names) ? names[0].name : 'unknown'} status=FAILURE error="${err}"`,
                });
                error = true;
            }
        } else {
            // Generate new name
            const randomName = uniqueNamesGenerator({ dictionaries: [colors, names, animals] });
            const body = { name : randomName };
            try {
                await axios.post(`http://${serverHostPort}/${endpoint}`, body, { headers });
                sendMessage(`POST /${endpoint} ${JSON.stringify(body)}`);
                logEntry({
                    level: 'info',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-requester`,
                    endpointLabel: spanTag,
                    endpoint,
                    message: `traceID=${traceId} http.method=POST endpoint=${endpoint} status=SUCCESS`,
                });
            } catch (err) {
                // The error condition is a little different here to using request. Axios throws a more generic error
                // which means that it's not obvious from the logs went wrong. You need to look at the mythical-server
                // logs to do so. This is a better example of drilldown and triage to previously.
                logEntry({
                    level: 'error',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-requester`,
                    endpointLabel: spanTag,
                    endpoint,
                    message: `traceID=${traceId} http.method=POST endpoint=${endpoint} name=${randomName}` +
                        ` status=FAILURE error="${err}"`,
                });
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
        if (error) {
            const version = (Math.floor(Math.random() * 100));
            if (version < 70) {
                requestSpan.setAttribute('service.version', '2.0.0');
            }
        }
        requestSpan.setStatus({ code: (!error) ? api.SpanStatusCode.OK : api.SpanStatusCode.ERROR });
        requestSpan.end();
    });

    // The following awful code creates spikes in the request rate which makes for more interesting graphs
    // Joe Elliott did not write this. Do not check the blame.
    counter++;
    if (counter >= 3000) {
      counter = 0;
    }

    var nextReqIn;
    if (counter < 2000) {
        // Choose low values in the first minute of every 5-minute interval
        nextReqIn =  Math.floor(Math.random() * 50);
      } else {
        // Choose high values for the next 4 minutes
        nextReqIn = Math.floor(Math.random() * 1000) + 100;
      }

    // Sometime in the next two seconds, but larger than 100ms
    //const nextReqIn = (Math.random() * 1000) + 100;
    setTimeout(() => makeRequest(tracingObj, sendMessage, logEntry), nextReqIn);
};

let counter = 0;

(async () => {
    const tracingObj = await tracingUtils();
    const { sendMessage } = await queueUtils(tracingObj);
    logEntry = await logUtils(tracingObj);

    // Kick off four requests that cycle at regular intervals
    setTimeout(() => makeRequest(tracingObj, sendMessage, logEntry), 5000);
    setTimeout(() => makeRequest(tracingObj, sendMessage, logEntry), 6000);
    setTimeout(() => makeRequest(tracingObj, sendMessage, logEntry), 7000);
    setTimeout(() => makeRequest(tracingObj, sendMessage, logEntry), 8000);

    // Ensure the danger gauge gets reset every minute
    setInterval(() => {
        dangerGauge.set(0);
    }, 30000);

    // Listen to API connections for metrics scraping.
    app.listen(4001);
})();
