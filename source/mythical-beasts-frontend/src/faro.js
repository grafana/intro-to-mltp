import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

let faro = null;
let configPromise = null;

// Fetch configuration from backend API
const fetchFaroConfig = async () => {
  try {
    // Use the same API base URL logic as the rest of the app
    const isProduction = process.env.NODE_ENV === 'production';
    const isDockerizedFrontend = window.location.hostname === 'localhost' && window.location.port === '3001';

    let baseUrl;
    if (isProduction && isDockerizedFrontend) {
      baseUrl = '/api'; // Use nginx proxy
    } else {
      baseUrl = 'http://localhost:4000'; // Direct API access
    }

    const response = await fetch(`${baseUrl}/config`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const config = await response.json();
    console.log('🔧 Fetched Faro config from backend:', config);
    return config;
  } catch (error) {
    console.warn('⚠️ Failed to fetch Faro config from backend, using defaults:', error);
    // Return default configuration if API call fails
    return {
      faroUrl: 'http://localhost:12350/collect',
      useGrafanaCloud: false,
      environment: 'development',
      version: '1.0.0',
      appName: 'mythical-frontend'
    };
  }
};

export const initFaro = async () => {
  // Return early if already initialized
  if (faro) {
    return faro;
  }

  // Use cached config promise if available
  if (!configPromise) {
    configPromise = fetchFaroConfig();
  }

  try {
    // Wait for configuration from backend
    const config = await configPromise;

    console.log('🔍 Faro URL:', config.faroUrl);
    console.log('🔍 Using Grafana Cloud:', config.useGrafanaCloud);
    console.log('🔍 CORS Proxy:', config.useGrafanaCloud ? 'Enabled (via localhost:8080)' : 'Not needed');

    // Standard Faro initialization
    faro = initializeFaro({
      url: config.faroUrl,

      // The application details will set relevant resources attributes.
      app: {
        name: config.appName,
        version: config.version,
        environment: config.environment,
      },

      // Enhanced session tracking for Grafana Cloud
      sessionTracking: {
        enabled: true,
        persistent: config.useGrafanaCloud, // Use persistent sessions for cloud
      },

      // Configure batching with appropriate timeouts
      batching: {
        enabled: true,
        sendTimeout: config.useGrafanaCloud ? 10000 : 5000, // Longer timeout for cloud
        itemLimit: config.useGrafanaCloud ? 50 : 25, // More items per batch for cloud
      },

      // Enhanced instrumentation for better observability
      instrumentations: [
        ...getWebInstrumentations({
          captureConsole: true,
          captureConsoleDisabledLevels: ['debug'], // Capture more for cloud
        }),

        // Add tracing instrumentation
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
        faro.api.pushLog(['Faro SDK initialized successfully'], {
          level: 'info',
          context: {
            source: 'faro-init',
            endpoint: config.faroUrl,
            useGrafanaCloud: config.useGrafanaCloud,
            corsProxy: config.useGrafanaCloud ? 'localhost:8080' : 'none'
          }
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
          if (typeof operation === 'function') {
            return operation();
          }
          return Promise.resolve();
        },
        getTraceContext: () => null,
        getOTEL: () => null,
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
