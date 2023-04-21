# Introduction to Metrics, Logs and Traces in Grafana

This is the companion repository to a series of presentations over the [three pillars of
observability within Grafana](https://grafana.com/blog/2022/04/01/get-started-with-metrics-logs-and-traces-in-our-new-grafana-labs-asia-pacific-webinar-series/). Whilst that series is now over a year old, we have kept this repository up-to-date with the latest versions of our products.

It is presented as a self-enclosed Docker sandbox that includes all of the components required to run on a local machine and experiment with the products provided.

Since the original series, this repository has seen its use grow. Whilst we still highly recommend everyone to sign up for a Grafana Cloud account, this repository exists as an easy way to get started with Grafana's offerings in a non-cloud, local-based setup. In addition, you can use this setup to experiment with configuration settings on those offerings.

You can also send data from the example microservice application to Grafana Cloud products.

## Prerequisites

The following demonstration environment requires:
* [Docker](https://www.docker.com/products/docker-desktop/)
* [Docker Compose (if not using a version of Docker that has it inbuilt)](https://docs.docker.com/compose/install/)

## Overview
The demos from this series were based on the application and code in this repository, which includes:

* Docker Compose manifest for easy setup.
* Four-service application:
  * A service requesting data from a REST API server.
  * A REST API server that receives requests and utilises a Database for storing/retrieving data for those requests.
  * A recorder service for storing messages to an AQMP bus.
  * A Postgres Database for storing/retrieving data from.
* Tempo service for storing trace information.
* Loki service for storing log information.
* Mimir service for storing metric information.
* Phlare service for storing profiling information.
* Grafana service for visualising observability data.
* Grafana Agent service for receiving traces and producing metrics and logs based on these traces.
* A Node Exporter service to retrieve resource metrics from the local host.

## Running the Demonstration Environment

Docker Compose will download the required Docker images, before starting the demonstration environment.

In the following examples, the in-built `compose` command is used with a latest version of Docker (for example, `docker compose up`). If using an older version of Docker with a separate Docker Compose binary, ensure that `docker compose` is replaced with `docker-compose`.

Data will be emitted from the microservice application and be stored in Loki, Tempo, and Prometheus. You can login to the Grafana service to visualize this data.

To execute the environment and login:

1. Start a new command-line interface in your Operating System and run:
   ```bash
   docker compose up
   ```
2. Login to the local Grafana service at http://localhost:3000/.

   *NOTE:* This assumes that port 3000 is not already in use. If this port is not free, edit the `docker-compose.yml` file and alter the line
   ```
   - "3000:3000"
   ```
   to some other host port that is free, for example:
   ```
   - "3123:3000"
   ```
3. Navigate to the [MLT dashboard](http://localhost:3000/d/4VSk5Lank/mlt-dashboard?orgId=1&refresh=5s).
4. Explore the data sources using the [Grafana Explorer](http://localhost:3000/explore?orgId=1&left=%7B%22datasource%22:%22Mimir%22,%22queries%22:%5B%7B%22refId%22:%22A%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D).

The [pre-provisioned dashboard](grafana/definitions/mlt.json) demonstrates a [RED (Rate, Error, Duration)](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/) overview of the microservice application, where almost all metrics are being generated via trace spans. The dashboard also provides an example of logging.

[Data links](https://grafana.com/docs/grafana/latest/panels-visualizations/configure-data-links/), [exemplars](https://grafana.com/docs/grafana-cloud/data-configuration/traces/exemplars/), and logs are utilized to allow jumping from the dashboard to a Grafana Explore page to observe traces, metrics, and logs in more detail.

The following is a brief explanation of each of the most important provided components.

## Grafana

Grafana is a multi-platform open source analytics and interactive visualisation web application. For more details about Grafana, please see the [documentation](https://grafana.com/docs/grafana/latest/).

The Grafana service is described in the `grafana` section of the [`docker-compose.yml`](docker-compose.yml) manifest.

The Docker Compose manifest:
* Mounts two repository directories to provide pre-provisioned data sources for data (`grafana/definitions`, `grafana/provisioning`).
* A [pre-provisioned dashboard](grafana/definitions/mlt.json) for correlating metrics, logs and traces.
  * The dashboard uses metrics from span traces to provide RED (Rate/Error/Duration) signals.
  * Data links are built into Grafana panels to pre-populate TraceQL queries based on the data. These act as an initial guide for digging into more detailed trace queries by extending the TraceQL.
* Exposes port `3000` for local login.
* Enables two Tempo features, namely span search and service graph support.

The updated `topnav` navigation within Grafana is enabled. If you wish to default back to the old UI, remove the `topnav` feature flag in the `GF_FEATURE_TOGGLES_ENABLE` environment variable for the `grafana` service in the [`docker-compose.yml`](docker-compose.yml) manifest.

## Mimir

Mimir is a backend store for metrics data from various sources. For more details about Mimir, please see the [documentation](https://grafana.com/docs/mimir/latest/).

The Mimir service is described in the `mimir` section of the [`docker-compose.yml`](docker-compose.yml) manifest.

The configuration file (`mimir/mimir.yml`):
* Configures a single service container acting as all relevant microservices.
* Stores the metrics data in-container (this will be lost on container deletion).

In addition to the scraped metrics, the Mimir service also receives remotely written metrics from the Tempo service, which derives metrics from incoming trace spans.

[This example](http://localhost:3000/explore?left=%7B%22datasource%22:%22mimir%22,%22queries%22:%5B%7B%22datasource%22:%7B%22type%22:%22prometheus%22,%22uid%22:%22mimir%22%7D,%22exemplar%22:true,%22expr%22:%22histogram_quantile%280.95,%20sum%28rate%28mythical_request_times_bucket%5B15s%5D%29%29%20by%20%28le,%20beast%29%29%22,%22interval%22:%22%22,%22refId%22:%22A%22%7D%5D,%22range%22:%7B%22from%22:%22now-5m%22,%22to%22:%22now%22%7D%7D&orgId=1) of the Mimir data source shows a histogram with [exemplars](https://grafana.com/docs/grafana-cloud/data-configuration/traces/exemplars/) (links to relevant traces). The example is available once the system is running and has collected enough data.

## Loki

Loki is a backend store for long-term log retention. For more details about Loki, read the [documentation](https://grafana.com/docs/loki/latest/).

The Loki service is described in the `loki` section of the [`docker-compose.yml`](docker-compose.yml) manifest.

Loki's default configuration is used, and as such no custom configuration file is bound to the container (unlike Mimir and Tempo).

[This example](http://localhost:3000/explore?left=%7B%22datasource%22:%22loki%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22expr%22:%22%7Bjob%3D%5C%22mythical-beasts-requester%5C%22%7D%20%7C%20logfmt%20%7C%20http_method%20%3D%20%5C%22POST%5C%22%20and%20__error__%3D%5C%22%5C%22%22,%22queryType%22:%22range%22,%22datasource%22:%7B%22type%22:%22loki%22,%22uid%22:%22loki%22%7D,%22editorMode%22:%22code%22,%22range%22:true,%22instant%22:true%7D%5D,%22range%22:%7B%22from%22:%22now-5m%22,%22to%22:%22now%22%7D%7D&orgId=1) shows the Loki data source using LogQL.

The microservices application sends its logs directly to the Loki service in this environment, via its REST API. There is the potential to switch this to the [Loki Docker driver](https://grafana.com/docs/loki/latest/clients/docker-driver/), if desired. To do so, follow the instructions for the driver, and then remove the three occurences of:
```
- LOGS_TARGET=http://loki:3100/loki/api/v1/push
```
in the [`docker-compose.yml`](docker-compose.yml) manifest for the `mythical-receiver`, `mythical-server` and `mythical-recorder` services. This will instead force the microservices to output logs to `stdout` which will be picked up by the Loki Docker driver.

## Tempo

Tempo is a backend store for longterm trace retention. For more details about Tempo, please see the [documentation](https://grafana.com/docs/tempo/latest/).

The Tempo service is described in the `tempo` section of the [`docker-compose.yml`](docker-compose.yml) manifest.

The Tempo service imports a configuration file (`tempo/tempo.yaml`) that initialises the service with some sensible defaults as well as allowing the receiving of traces in a variety of different formats.

Tempo is also configured to generate metrics from incoming trace spans as part of it's configuration. As such, this no longer occurs via Grafana Agent (although the original configuration for the Agent to carry this out has been left in the Agent configuration file as a guide).

For an example of a span search, look at the Explorer page using the Tempo data source, [here](http://localhost:3000/explore?orgId=1&left=%7B%22datasource%22:%22tempo%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22datasource%22:%7B%22type%22:%22tempo%22,%22uid%22:%22tempo%22%7D,%22queryType%22:%22nativeSearch%22,%22serviceName%22:%22mythical-requester%22,%22minDuration%22:%22100ms%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D).

[This example](http://localhost:3000/explore?orgId=1&left=%7B%22datasource%22:%22tempo%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22datasource%22:%7B%22type%22:%22tempo%22,%22uid%22:%22tempo%22%7D,%22queryType%22:%22traceql%22,%22serviceName%22:%22mythical-requester%22,%22minDuration%22:%22100ms%22,%22limit%22:20,%22query%22:%22%7B%20.service.name%20%3D%20%5C%22mythical-server%5C%22%20%26%26%20duration%20%3E%20100ms%20%7D%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D) uses the same parameters as above, but in TraceQL (a fully featured tracing query language).

For an example of the mini-APM table and Service Graphs, use the 'Service Graph' tab [here](http://localhost:3000/explore?orgId=1&left=%7B%22datasource%22:%22tempo%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22datasource%22:%7B%22type%22:%22tempo%22,%22uid%22:%22tempo%22%7D,%22queryType%22:%22serviceMap%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D).

Traces are instrumented using the OpenTelemetry SDK, more details on which can be found [here](https://opentelemetry.io/docs/).
## Phlare

*As of March 2023, Grafana Labs acquired Pyroscope. Moving forward, Grafana's continuous profiling product will be known as Grafana Pyroscope as the Phlare and Pyroscope projects are merged. See this [blog post](https://grafana.com/blog/2023/03/15/pyroscope-grafana-phlare-join-for-oss-continuous-profiling/?pg=docs-phlare-latest) for more information.*

Phlare is a continuous profiling backend store. For more details about Phlare, please see the [documentation](https://grafana.com/docs/phlare/latest/).

The Tempo service is described in the `phlare` section of the [`docker-compose.yml`](docker-compose.yml) manifest.

Phlare uses a configuration file (`phlare/phlare.yaml`) that is configured to scrape [pprof](https://github.com/google/pprof) profiles from the Mythical microservices.

pprof samples are scraped directly from the application on the `/debug/pprof/profile` endpoint (and supported using appropriate NPM modules).

You can see an example of profiling in action once the system is running by using the Explorer to visualise the profiles stored [here](http://localhost:3000/explore?orgId=1&left=%7B%22datasource%22:%22phlare%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22datasource%22:%7B%22type%22:%22phlare%22,%22uid%22:%22phlare%22%7D,%22labelSelector%22:%22%7B%7D%22,%22queryType%22:%22both%22,%22groupBy%22:%5B%5D,%22profileTypeId%22:%22process_cpu:sample:count:wall:microseconds%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D).

*Note:* Currently it can take a few minutes before enough profiling information is available. You may see an error until a few minutes have passed on initial startup.

## Grafana Agent

Grafana Agent is a configurable local agent for receiving metrics, logs and traces and forwarding them to relevant database stores. For more details about Grafana Agent, please see the [documentation](https://grafana.com/docs/agent/latest/).

Grafana Agent is a locally installed agent that acts as:
* A Prometheus scraping service and metric/label rewriter.
* A Promtail (Loki logs receiver) service and processor.
* A Tempo trace receiver and span processor.
* Remote writer for MLT data to Grafana Cloud (or any other compatible storage system).

In this example environment, Grafana Agent:
* Receives metrics data, via scrape configs, emitted by:
  * The microservice application.
  * The Mimir service for operational monitoring.
  * The Loki service for operational monitoring.
  * The Tempo service for operatational monitoring.
  * The Agent itself, for operational monitoring.
  * The installed Node Exporter service.
* Receives trace data, via trace configs, emitted by the microservice application.
* Generates automatic logging lines based on the trace data received.
* Sends metric, log and trace data onwards to the Mimir, Loki and Tempo services, respectively.

Note that as Grafana Agent scrapes metrics for every service defined in the [`docker-compose.yml`](docker-compose.yml) that a significant number of metric [active series](https://grafana.com/docs/grafana-cloud/billing-and-usage/active-series-and-dpm/) are produced (approximately 11,000 at time of writing).

The full configuration for Grafana Agent can be found [here](agent/config.yaml).

### Metrics Generation

It should be noted that since [v1.4.0](https://github.com/grafana/tempo/blob/main/CHANGELOG.md#v140--2022-04-28), Tempo has included the ability to generate [RED (Rate, Error, Duration)](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/) [span](https://grafana.com/docs/tempo/latest/metrics-generator/span_metrics/) and [service graph](https://grafana.com/docs/tempo/latest/metrics-generator/service_graphs/) metrics.

As such, the Grafana Agent configuration now includes a commented section where those metrics used to be generated; this is now handled directly in Tempo via server-side metrics generation.

Whilst this is convenient for many users, you may prefer to generate metrics locally via Grafana Agent rather than Tempo server-side. These include environments where tail-based sampling may be utilized to discard certain traces.

Tempo metrics generation will only generate span and service graph metrics for trace spans that Tempo receives. If tail sampling is active, then a full view of the metrics in a system will not be available.

In these instances, using Grafana Agent to generate metrics can ensure a complete set of metrics for all traces span data are generated, as the Agent carries out tail sampling post-metrics generation.

## Microservice Source

The source for the microservice application can be found in the [`source`](source) directory. It is a three-service application that utilises a [PostgreSQL](https://www.postgresql.org/) database and an [AQMP](https://www.amqp.org/) bus to store data.

The services are written in [JavaScript](https://www.javascript.com/) and execute under [NodeJS](https://nodejs.org/en) inside [Docker](https://www.docker.com/products/docker-desktop/) containers.

The [`requester`](source/mythical-beasts-requester/index.js) service makes 'random' requests to the [`server`](source/mythical-beasts-server/index.js), which then inserts, retrieves or deletes data from the Postgres database. The `requester` service also stores data to the AQMP queue via the [`recorder`](source/mythical-beasts-recorder/index.js) service.

All three services use common code to deal with the [`queue`](source/common/queue.js), [`logging`](source/common/logging.js) and [`tracing`](source/common/tracing.js) requirements they have. The latter is an example of a simple shim API library for utilising the OpenTelemetry SDK in an application.

There is a common [`Dockerfile`](source/docker/Dockerfile) that is used to build all three services.

## Grafana Cloud

>**Note**: By default, as mentioned in the Grafana Agent section, metrics are scraped by default from every service. If sending metrics to Grafana Cloud, check the number of metric [active series](https://grafana.com/docs/grafana-cloud/billing-and-usage/active-series-and-dpm/) that you can store without additional cost.

This demo can be run against Grafana Cloud using Docker Compose as follows:

1. Configure and source the Metrics, Logs, and Traces environment variables in the file [`cloud/envvars-grafana-cloud-unconfigured.sh`](cloud/envvars-grafana-cloud-unconfigured.sh) from a Grafana Cloud service. Generally, only the environment variables tagged with “__ID__” and “__API_KEY__” need to be updated, sometimes the _HOST variables will need to be modified. You can retrieve these details from your Grafana Cloud organization pages for the relevant stack.
   ```bash
   source cloud/envvars-grafana-cloud-unconfigured.sh
   ```
2. Configure the environment
   ```bash
   ./ctl.sh cloud-configure
   ```
3. Run the demo using Docker Compose
   ```bash
   ./ctl.sh cloud-up
   ```
4. Load the example dashboard `cloud/dashboard-metrics-logs-traces-1.json` into the Grafana Cloud Instance to visualize the metrics, logs and traces being generated by this demo

5. Stop the demo using
   ```bash
   ./ctl.sh cloud-down
   ```

>**Note:** The configuration for Grafana Agent to send data to Grafana Cloud includes configuration that generates span metrics and service graph metrics.