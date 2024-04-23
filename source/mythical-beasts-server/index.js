const traceUtils = require('./tracing')('server', 'mythical-server');
const Pyroscope = require('@pyroscope/nodejs');
const { expressMiddleware } = require('@pyroscope/nodejs');
const logUtils = require('./logging')('mythical-server', 'server');

(async () => {
    const traceObj = await traceUtils();
    const logEntry = await logUtils(traceObj);
    const { tracer, api } = traceObj;

    const promClient = require('prom-client');
    const express = require('express');
    const bodyParser = require('body-parser');
    const { Client } = require('pg');
    const { nameSet, servicePrefix, spanTag } = require('./endpoints')();

    // Prometheus client registration
    const app = express();
    const register = promClient.register;
    register.setContentType(promClient.Registry.OPENMETRICS_CONTENT_TYPE);

    // Database full teardown timeout
    const teardownTimeout = 24 * 60 * 60 * 1000; // Default is every 24 hours
    let teardownInProgress = false;

    // Use JSON parsing in the request body
    app.use(bodyParser.json());
    let pgClient;

    // Database actions
    const Database = {
        GET: 0,
        POST: 1,
        DELETE: 2,
        DROP: 3,
        CREATE: 4,
    };

    // Status response bucket (histogram)
    const responseBucket = new promClient.Histogram({
        name: 'mythical_request_times',
        help: 'Response times for the endpoints',
        labelNames: ['method', 'status', spanTag],
        buckets: [10, 20, 50, 100, 200, 500, 1000, 2000, 4000, 8000, 16000],
        enableExemplars: true,
    });

    // Database action function
    const databaseAction = async (action) => {
        // Which action?
        const span = api.trace.getSpan(api.context.active());
        span.setAttribute('span.kind', api.SpanKind.CLIENT);
        if (action.method === Database.GET) {
            const results = await pgClient.query(`SELECT name from ${action.table}`);
            return results.rows;
        } else if (action.method === Database.POST) {
            return await pgClient.query(`INSERT INTO ${action.table}(name) VALUES ($1)`, [ action.name ]);
        } else if (action.method === Database.DELETE) {
            return await pgClient.query(`DELETE FROM ${action.table} WHERE name = $1`, [ action.name ]);
        } else if (action.method == Database.DROP) {
            const traceId = api.trace.getSpan(api.context.active()).spanContext();
            for (const table of nameSet) {
                await pgClient.query(`DROP TABLE ${table}`);
                logEntry({
                    level: 'info',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-server`,
                    message: `traceId=${traceId} message="Dropped table ${table}..."`,
                });
            }
            return;
        } else if (action.method === Database.CREATE) {
            const traceId = api.trace.getSpan(api.context.active()).spanContext();
            for (const table of nameSet) {
                await pgClient.query(`CREATE TABLE IF NOT EXISTS ${table}(id serial PRIMARY KEY, name VARCHAR (50) UNIQUE NOT NULL);`);
                logEntry({
                    level: 'info',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-server`,
                    message: `traceId=${traceId} message="Created table ${table}..."`,
                });
            }
            return;
        }

        logEntry({
            level: 'error',
            namespace: process.env.NAMESPACE,
            job: `${servicePrefix}-server`,
            message: 'message="Method was not valid, throwing error"',
        });
        throw new Error(`Not a valid ${spanTag} method!`);
    }

    // Response time bucket function (adds a Prometheus value)
    const responseMetric = (details) => {
        const timeMs = Date.now() - details.start;
        const spanContext = api.trace.getSpan(api.context.active()).spanContext();
        responseBucket.observe({
            labels: details.labels,
            value: timeMs,
            exemplarLabels: {
                traceID: spanContext.traceId,
                spanID: spanContext.spanId,
            },
        });
    };

    // Metrics endpoint handler (for Prometheus scraping)
    app.get('/metrics', async (req, res) => {
        res.set('Content-Type', register.contentType);
        res.send(await register.metrics());
    });

    // Initialise the Pyroscope library to send pprof data.
    Pyroscope.init({
        appName: 'mythical-beasts-server',
    });
    app.use(expressMiddleware());

    // Generic GET endpoint
    app.get('/:endpoint', async (req, res) => {
        const endpoint = req.params.endpoint;
        const currentSpan = api.trace.getSpan(api.context.active());
        const spanContext = currentSpan.spanContext();
        const traceId = spanContext.traceId;

        currentSpan.setAttribute(spanTag, endpoint);

        let metricBody = {
            labels: {
                method: 'GET',
            },
            start: Date.now(),
        };
        metricBody.labels[spanTag] = endpoint;

        if (!nameSet.includes(endpoint)) {
            res.status(404).send(`${endpoint} is not a valid endpoint`);
            metricBody.labels.status = '404';
            responseMetric(metricBody);
            return;
        }

        // If we're in the middle of a teardown, don't do anything
        if (teardownCheck({
                spanContext,
                endpoint,
                method: 'GET',
                res,
            }) === true) {
            return;
        }

        // Retrieve all the names
        try {
            const results = await databaseAction({
                method: Database.GET,
                table: endpoint,
            });

            // Metrics
            metricBody.labels.status = '200';
            responseMetric(metricBody);

            logEntry({
                level: 'info',
                namespace: process.env.NAMESPACE,
                job: `${servicePrefix}-server`,
                endpointLabel: spanTag,
                endpoint,
                message: `traceID=${traceId} http.method=GET endpoint=${endpoint} status=SUCCESS`,
            });

            res.send(results);
        } catch (err) {
            metricBody.labels.status = '500';
            responseMetric(metricBody);

            logEntry({
                level: 'error',
                namespace: process.env.NAMESPACE,
                job: `${servicePrefix}-server`,
                endpointLabel: spanTag,
                endpoint,
                message: `traceID=${traceId} http.method=GET endpoint=${endpoint} status=FAILURE error="${err}"`,
            });

            res.status(500).send(err);
        }
    });

    // Generic POST endpoint
    app.post('/:endpoint', async (req, res) => {
        const endpoint = req.params.endpoint;
        const currentSpan = api.trace.getSpan(api.context.active());
        const spanContext = currentSpan.spanContext();
        const traceId = spanContext.traceId;

        let metricBody = {
            labels: {
                method: 'POST',
            },
            start: Date.now(),
        };
        metricBody.labels[spanTag] = endpoint;

        if (!nameSet.includes(endpoint)) {
            res.status(404).send(`${endpoint} is not a valid endpoint`);
            metricBody.labels.status = '404';
            responseMetric(metricBody);
            return;
        }

        if (!req.body || !req.body.name) {
            // Here we'd use 'respondToCall()' which would POST a metric for the response
            // code
            metricBody.labels.status = '400';
            responseMetric(metricBody);
        }

        // If we're in the middle of a teardown, don't do anything
        if (teardownCheck({
                spanContext,
                endpoint,
                method: 'POST',
                res,
            }) === true) {
            return;
        }
        // POST a new unicorn name
        try {
            let name = req.body.name
            if (process.env.ALWAYS_SUCCEED != "true" && Math.random() < 0.1) {
                name = null
            }

            await databaseAction({
                method: Database.POST,
                table: endpoint,
                name: name,
            });

            // Metrics
            metricBody.labels.status = '201';
            responseMetric(metricBody);

            logEntry({
                level: 'info',
                namespace: process.env.NAMESPACE,
                job: `${servicePrefix}-server`,
                endpointLabel: spanTag,
                endpoint,
                message: `traceID=${traceId} http.method=POST endpoint=${endpoint} status=SUCCESS`,
            });

            res.sendStatus(201);
        } catch (err) {
            // Metrics
            metricBody.labels.status = '500';
            responseMetric(metricBody);

            logEntry({
                level: 'error',
                namespace: process.env.NAMESPACE,
                job: `${servicePrefix}-server`,
                endpointLabel: spanTag,
                endpoint,
                message: `traceID=${traceId} http.method=GET endpoint=${endpoint} status=FAILURE error="${err}"`,
            });

            res.status(500).send(err);
        }
    });

    // Generic DELETE endpoint
    app.delete('/:endpoint', async (req, res) => {
        const endpoint = req.params.endpoint;
        const currentSpan = api.trace.getSpan(api.context.active());
        const spanContext = currentSpan.spanContext();
        const traceId = spanContext.traceId;

        let metricBody = {
            labels: {
                method: 'DELETE',
            },
            start: Date.now(),
        };
        metricBody.labels[spanTag] = endpoint;

        if (!nameSet.includes(endpoint)) {
            res.status(404).send(`${endpoint} is not a valid endpoint`);
            metricBody.labels.status = '404';
            responseMetric(metricBody);
            return;
        }

        if (!req.body || !req.body.name) {
            // Here we'd use 'respondToCall()' which would POST a metric for the response
            // code
            metricBody.labels.status = '400';
            responseMetric(metricBody);
        }

        // If we're in the middle of a tearxdown, don't do anything
        if (teardownCheck({
                spanContext,
                endpoint,
                method: 'GET',
                res,
            }) === true) {
            return;
        }

        // Delete a manticore name
        try {
            await databaseAction({
                method: Database.DELETE,
                table: endpoint,
                name: req.body.name,
            });

            // Metrics
            metricBody.labels.status = '204';
            responseMetric(metricBody);

            logEntry({
                level: 'info',
                namespace: process.env.NAMESPACE,
                job: `${servicePrefix}-server`,
                endpointLabel: spanTag,
                endpoint,
                message: `traceID=${traceId} http.method=DELETE endpoint=${endpoint} status=SUCCESS`,
            });

            res.sendStatus(204);
        } catch (err) {
            // Metrics
            metricBody.labels.status = '500';
            responseMetric(metricBody);

            logEntry({
                level: 'error',
                namespace: process.env.NAMESPACE,
                job: `${servicePrefix}-server`,
                endpointLabel: spanTag,
                endpoint,
                message: `traceID=${traceId} http.method=DELETE endpoint=${endpoint} status=FAILURE error="${err}"`,
            });

            res.status(500).send(err);
        }
    });

    // Destroy the DB table and recreate it
    const tableWipe = async () => {
        const requestSpan = tracer.startSpan('server');
        const { traceId } = requestSpan.spanContext();

        // Create a new context for this request
        await api.context.with(api.trace.setSpan(api.context.active(), requestSpan), async () => {
            // You know, there are positives and negatives to using an event thread
            // based model. But when it comes to stuff like this, I sure don't miss
            // pthread mutices. One variable change. One.
            teardownInProgress = true;

            try {
                // DROP the table
                logEntry({
                    level: 'info',
                    job: `${process.env.NAMESPACE}/${servicePrefix}-server`,
                    namespace: process.env.NAMESPACE,
                    message: `traceId=${traceId} message="DROPing tables..."`,
                });

                await databaseAction({
                    method: Database.DROP,
                });

                // Recreate the tables for each endpoint
                logEntry({
                    level: 'info',
                    job: `{servicePrefix}-server`,
                    namespace: process.env.NAMESPACE,
                    message: `traceId=${traceId} message="CREATEing tables..."`,
                });

                await databaseAction({
                    method: Database.CREATE,
                });
            } catch(err) {
                logEntry({
                    level: 'info',
                    job: `${servicePrefix}-server`,
                    namespace: process.env.NAMESPACE,
                    message: `traceId=${traceId} error="${err}"`,
                });
            } finally {
                teardownInProgress = false;
                requestSpan.end();
            }
        });
    };

    // Checks to see if there's a teardown in progress
    const teardownCheck = (details) => {
        const { spanContext, endpoint, method, res } = details;
        // If we're in the middle of a teardown, don't do anything.
        if (teardownInProgress) {
            logEntry({
                level: 'error',
                namespace: process.env.NAMESPACE,
                job: `${servicePrefix}-server`,
                message: `traceID=${traceId} http.method=${method} endpoint=${endpoint} status=FAILURE error='Table is not available'`,
            });
            res.status(500).send('Table is not available');
            return true;
        }

        return false;
    };

    // Create the DB and connect to it
    const startServer = async () => {
        const requestSpan = tracer.startSpan('server');
        // Create a new context for this request
        await api.context.with(api.trace.setSpan(api.context.active(), requestSpan), async () => {
            try {
                logEntry({
                    level: 'info',
                    job: `${servicePrefix}-server`,
                    namespace: process.env.NAMESPACE,
                    message: 'Installing postgres client...',
                });
                pgClient = new Client({
                    host: 'mythical-database',
                    port: 5432,
                    user: 'postgres',
                    password: 'mythical',
                });

                await pgClient.connect();
                const results = await pgClient.query(`SELECT COUNT(*) FROM pg_catalog.pg_database WHERE datname = '${spanTag}';`);
                if (results.rows[0].exists === false) {
                    logEntry({
                        level: 'info',
                        namespace: process.env.NAMESPACE,
                        job: `${servicePrefix}-server`,
                        message: 'Database entry did not exist, creating...',
                    });
                    await pgClient.query(`CREATE DATABASE ${spanTag}`);
                }

                logEntry({
                    level: 'info',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-server`,
                    message: 'Creating tables...',
                });

                // Create the tables.
                await databaseAction({
                    method: Database.CREATE,
                });

                // Listen to API connections.
                app.listen(4000);

                // Schedule a table wipe in the future.
                setInterval(() => tableWipe(), teardownTimeout);

                logEntry({
                    level: 'info',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-server`,
                    message: `${servicePrefix} server up and running...`,
                });
            } catch (err) {
                pgClient.end();
                logEntry({
                    level: 'info',
                    namespace: process.env.NAMESPACE,
                    job: `${servicePrefix}-server`,
                    message: `${servicePrefix} server could not start, trying again in 5 seconds... ${err}`,
                });
                setTimeout(() => startServer(), 5000);
            } finally {
                requestSpan.end();
            }
        });
    };

    // Start up the API server
    startServer();
})();
