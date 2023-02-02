const tracingUtils = require('./tracing')('recorder', 'mythical-recorder');
const express = require('express');
const promClient = require('prom-client');
const queueUtils = require('./queue')();
const pprof = require('pprof');

// Prometheus client registration
const app = express();
const register = promClient.register;
register.setContentType(promClient.Registry.OPENMETRICS_CONTENT_TYPE);

// Status response bucket (histogram)
const messagesCounter = new promClient.Counter({
    name: 'mythical_messages_recorded',
    help: 'The amount of messages recorded by the mythical-recorder',
});

// Metrics endpoint handler (for Prometheus scraping)
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
});

// Endpoint for pprof handler (for Phlare)
app.get('/debug/pprof/profile', async (req, res) => {
    if (!req.query.seconds) {
        res.status(400).send('seconds parameter is required');
        return;
    }
    try {
        const profile = await pprof.time.profile({
            durationMillis: req.query.seconds * 1000
        });
        const encoded = await pprof.encode(profile);
        res.set('Content-Type', 'application/octet-stream');
        res.send(encoded);
    } catch (err) {
        console.log(`Error getting profile - ${err}`);
    }
});

const startQueueConsumer = async () => {
    const tracingObj = await tracingUtils();
    const { consumeMessages } = await queueUtils( tracingObj );

    const { tracer } = tracingObj;

    await consumeMessages(async msg => {
        tracer.startActiveSpan('process_message', async span => {
            messagesCounter.inc();

            if (msg.content.toString().match(/(?:\/beholder|\/unicorn)/i)) {
                await new Promise(r => setTimeout(r, (Math.random() * 1000) + 500));
            }

            if (msg !== null) {
                console.log(`Received a message: ${msg.content.toString()}`);
            } else {
                console.log('Consumer cancelled by server');
            }

            // Pretend to do some work here
            const workTime = (Math.random() * 30) + 20;
            await new Promise(resolve => setTimeout(resolve, workTime));

            span.end();
        });
    });
}

// Listen to API connections for metrics scraping.
app.listen(4002);

startQueueConsumer();
