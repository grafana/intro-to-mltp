module.exports = () => {
    const queueName = 'messages';

    return async (tracingObj) => {
        const {api, tracer} = tracingObj;

        // import here to ensure it's called after the tracing client has been set up
        const amqplib = require('amqplib');

        const connection = await amqplib.connect('amqp://mythical-queue');
        const channel = await connection.createChannel();
        await channel.assertQueue(queueName);

        const sendMessage = async msg => {
            tracer.startActiveSpan('publish_to_queue', async span => {
                try {
                    channel.sendToQueue(queueName, Buffer.from(msg));
                    if (msg.match(/(?:\/beholder|\/unicorn)/i)) {
                        await new Promise(r => setTimeout(r, (Math.random() * 2000) + 500));
                    }
                    span.setStatus({code: api.SpanStatusCode.OK});
                } catch (err) {
                    console.log(`Error publishing message on the queue: ${err}`);
                    span.setStatus({code: api.SpanStatusCode.ERROR});
                }
                span.end();
            });
        };

        const consumeMessages = async callback => {
                await channel.consume(queueName, async function (msg) {
                await callback(msg);
                channel.ack(msg);
            });
        };

        return { sendMessage, consumeMessages };
    }
}