// This is shared between the requester and the server
// As such, to only do what's needed, we init using a
// function and then pass the service context to
// determine what to initialise.
module.exports = (context, serviceName) => {
  // Include all OpenTelemetry dependencies for tracing
  const api = require("@opentelemetry/api");
  const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
  const { SimpleSpanProcessor } = require("@opentelemetry/sdk-trace-base");
  const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
  const { Resource } = require('@opentelemetry/resources');
  const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
  let getNodeAutoInstrumentations;
  let registerInstrumentations;
  let W3CTraceContextPropagator;

  // If this is the server, it's all autoinstrumented.
  // Else include the propagator.
  if (context === 'server') {
    getNodeAutoInstrumentations = require('@opentelemetry/auto-instrumentations-node').getNodeAutoInstrumentations;
    registerInstrumentations = require('@opentelemetry/instrumentation').registerInstrumentations;
  } else {
    W3CTraceContextPropagator = require("@opentelemetry/core").W3CTraceContextPropagator;
  }

  const options = {
    tags: [],
    host: process.env.TRACING_COLLECTOR_HOST,
    port: process.env.TRACING_COLLECTOR_PORT,
    maxPacketSize: 65000
  }

  // Create a tracer provider
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
  });

  // Export to Jaeger
  const exporter = new JaegerExporter(options);

  // Use simple span (should probably use Batch)
  const processor = new SimpleSpanProcessor(exporter);
  provider.addSpanProcessor(processor);
  provider.register();


  // Create a new header for propagation from a given span
  let createPropagationHeader;
  if (context === 'requester') {
    const propagator = new W3CTraceContextPropagator();
    createPropagationHeader = (span) => {
      let carrier = {};
      // Inject the current trace context into the carrier object
      propagator.inject(
          api.trace.setSpanContext(api.ROOT_CONTEXT, span.spanContext()),
          carrier,
          api.defaultTextMapSetter
      );
      return carrier;
    };
  }

  // Enable everything that's available for auto-instrumentation
  // if this is the server.
  if (context === 'server') {
    registerInstrumentations({
      instrumentations: [getNodeAutoInstrumentations()],
    });
  }

  // Return instances of the API and the tracer to the calling app
  return {
    tracer: api.trace.getTracer(serviceName),
    api: api,
    propagator: (context === 'requester') ? createPropagationHeader : undefined,
  }
};
