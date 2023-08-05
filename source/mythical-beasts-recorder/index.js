const tracingUtils = require('./tracing')('recorder', 'mythical-recorder');
const express = require('express');
const promClient = require('prom-client');
const queueUtils = require('./queue')();
const Pyroscope = require('@pyroscope/nodejs');
const { expressMiddleware } = require('@pyroscope/nodejs');

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

// Initialise the Pyroscope library to send pprof data.
Pyroscope.init({
    appName: 'mythical-beasts-recorder',
});
app.use(expressMiddleware());

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
