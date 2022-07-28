// This is shared between the requester, the recorder and the server
// As such, to only do what's needed, we init using a
// function and then pass the service context to
// determine what to initialise.
module.exports = (context, serviceName) => {
  // Include all OpenTelemetry dependencies for tracing
  const api = require("@opentelemetry/api");
  const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
  const { SimpleSpanProcessor } = require("@opentelemetry/sdk-trace-base");
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
  const { envDetector, Resource } = require('@opentelemetry/resources');
  const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
  const { registerInstrumentations } = require('@opentelemetry/instrumentation');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

  return async () => {
    let W3CTraceContextPropagator;
    if (context === 'requester') {
      W3CTraceContextPropagator = require("@opentelemetry/core").W3CTraceContextPropagator;
    }

    const detected = await envDetector.detect();

    const resources = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }).merge(detected);

    // Create a tracer provider
    const provider = new NodeTracerProvider({
      resource: resources,
    });

    // Export via OTLP gRPC
    const exporter = new OTLPTraceExporter({
      url: `${process.env.TRACING_COLLECTOR_HOST}:${process.env.TRACING_COLLECTOR_PORT}`
    });

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

    registerInstrumentations({
      instrumentations: [getNodeAutoInstrumentations()],
    });

    // Return instances of the API and the tracer to the calling app
    return {
      tracer: api.trace.getTracer(serviceName),
      api: api,
      propagator: createPropagationHeader,
    }
  };
};
