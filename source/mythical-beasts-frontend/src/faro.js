import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

let faro = null;

export const initFaro = () => {
  // Return early if already initialized
  if (faro) {
    return faro;
  }

  try {
    // Get the Alloy endpoint from environment
    const alloyEndpoint = process.env.REACT_APP_ALLOY_ENDPOINT || 'http://localhost:12350/collect';

    console.log('🔍 Initializing Faro with endpoint:', alloyEndpoint);

    // Initialisation with a average configuration.
    faro = initializeFaro({
      // This is the endpoint to send telemetry to. In this case, we're sending to Alloy.
      url: alloyEndpoint,
      // The application details will set relevant resources attributes.
      app: {
        name: 'mythical-frontend',
        version: '1.0.0',
        environment: 'development',
      },

      // Basic session tracking
      sessionTracking: {
        enabled: true,
        persistent: false, // Simplified to avoid storage issues
      },

      // Configure batching with longer timeouts to be a bit more forgiving on slower machines.
      batching: {
        enabled: true,
        sendTimeout: 5000, // Longer timeout to prevent connection issues
      },

      // Basic instrumentation.
      instrumentations: [
        ...getWebInstrumentations({
          captureConsole: false, // Disable console capture to reduce noisey output. Set to true to capture:
          captureConsoleDisabledLevels: ['debug', 'log'],
        }),

        // Add tracing instrumentation with simple configuration.
        new TracingInstrumentation({
          instrumentationOptions: {
            // Only trace API calls to our backend
            propagateTraceHeaderCorsUrls: [
              /^\/api\//,  // Relative URLs for nginx proxied requests
              /^http:\/\/localhost:4000/, // Direct API calls
            ],
          },
        }),
      ],

      // Some basic error handling.
      beforeSend: (event) => {
        // Simple pass-through with error handling
        try {
          return event;
        } catch (error) {
          console.warn('Faro beforeSend error:', error);
          return null;
        }
      },
    });

    console.log('✅ Faro initialized successfully');

    // Send a simple test event
    setTimeout(() => {
      try {
        faro.api.pushLog(['Faro SDK test log'], {
          level: 'info',
          context: { source: 'faro-init' }
        });
      } catch (error) {
        console.warn('Failed to send test log:', error);
      }
    }, 1000);

    return faro;

  } catch (error) {
    console.warn('⚠️ Failed to initialize Faro SDK:', error);

    // Return a safe mock object to prevent issues
    faro = {
      api: {
        pushLog: () => {},
        pushError: () => {},
        pushMeasurement: (measurement, operation) => {
          // If there's an operation function, just call it directly
          if (typeof operation === 'function') {
            return operation();
          }
          return Promise.resolve();
        },
        getTraceContext: () => null,
      }
    };

    return faro;
  }
};

// Shim to export the Faro object.
export const getFaro = () => {
  if (!faro) {
    return initFaro();
  }
  return faro;
};

export default { initFaro, getFaro };
