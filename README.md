# Introduction to Metrics, Logs and Traces in Grafana

This is the companion repository to a series of presentations over the three pillars of
observability within Grafana.

It is presented as a self-enclosed Docker sandbox that includes all of the components required to run on a local machine and experiment with the services provided.

Since the original series, this repository has seen its use grow. Whilst we still hugely encourage everyone to sign up for a Grafana Cloud account, this repository assist an easy way to get started with Grafana's offerings in a non-cloud, local based setup and to experiment with configuration settings on those offerings.

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
* Tempo instance for storing trace information.
* Loki instance for storing log information.
* Mimir instance for storing metric information.
* Phlare instance for storing profiling information.
* Grafana instance for visualising observability information.
* Grafana Agent instance for receiving traces and producing metrics and logs based on these traces.
* A Node Exporter instance to retrieve resource metrics from the local host.

## Running the Demonstration Environment

Docker Compose will download the required Docker images, before starting the demonstration environment. Data will be emitted from the microservice application and be stored in Loki, Tempo and Prometheus. You can login to the Grafana instance to visualise this data. To execute the environment and login:

1. Start a new command-line interface in your Operating System and run:
   ```bash
   docker-compose up
   ```
2. Login to the local Grafana instance at http://localhost:3000/. The default credentials for Grafana are `admin` as both the username and password. Change the credentials if you wish, or skip.
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

The following is a brief explanation of each of the most important provided components.

## Grafana

Grafana is a visualisation tool that allows the creation of dashboards from various data sources. More information can be found [here](https://grafana.com/docs/grafana/latest/).

The Grafana instance is described in the `grafana` section of the `docker-compose.yml` manifest.

It:
* Mounts two repository directories to provide pre-provisioned data sources for data.
* A pre-provisioned dashboard for correlating metrics, logs and traces.
* Exposes port `3000` for local login.
* Enables two Tempo features, namely span search and service graph support.

No custom configuration is used.

Note that in this latest version, `topnav` navigation within Grafana is enabled. If you wish to default back to the old UI, remove the `topnav` feature flag in the `GF_FEATURE_TOGGLES_ENABLE` environment variable for the `grafana` service in the [`docker-compose`](docker-compose.yml) manifest.

## Mimir

Mimir is a backend store for metrics data from various sources. More information can be found [here](https://grafana.com/docs/mimir/latest/).

The Mimir instance is described in the `mimir` section of the `docker-compose.yml` manifest.

The configuration file (`mimir/mimir.yml`):
* Configures a single instance container acting as all relevant microservices.
* Stores the metrics data in-container (this will be lost on container deletion).

Additionally to the scraped metrics, it also receives remotely written metrics from the Tempo service, which derives metrics from incoming trace spans.

An example of the Mimir data source showing a histogram with exemplars (links to relevant traces), is [here](http://localhost:3000/explore?left=%7B%22datasource%22:%22mimir%22,%22queries%22:%5B%7B%22datasource%22:%7B%22type%22:%22prometheus%22,%22uid%22:%22mimir%22%7D,%22exemplar%22:true,%22expr%22:%22histogram_quantile%280.95,%20sum%28rate%28mythical_request_times_bucket%5B15s%5D%29%29%20by%20%28le,%20beast%29%29%22,%22interval%22:%22%22,%22refId%22:%22A%22%7D%5D,%22range%22:%7B%22from%22:%22now-5m%22,%22to%22:%22now%22%7D%7D&orgId=1), once the system is running and has collected enough data.

## Loki

Loki is a backend store for longterm log retention. More information can be found [here](https://grafana.com/docs/loki/latest/).

The Loki instance is described in the `loki` section of the `docker-compose.yml` manifest.

This instance is simply the `latest` Loki image available, and exposes its interface on port `3100`.

The microservices application sends its logs directly to the Loki instance in this environment, via its REST API.

Loki's default configuration is used, and as such no custom configuration file is bound to the container (unlike Mimir and Tempo).

An example of the Loki data source using LogQL is [here](http://localhost:3000/explore?left=%7B%22datasource%22:%22loki%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22expr%22:%22%7Bjob%3D%5C%22mythical-beasts-requester%5C%22%7D%20%7C%20logfmt%20%7C%20http_method%20%3D%20%5C%22POST%5C%22%20and%20__error__%3D%5C%22%5C%22%22,%22queryType%22:%22range%22,%22datasource%22:%7B%22type%22:%22loki%22,%22uid%22:%22loki%22%7D,%22editorMode%22:%22code%22,%22range%22:true,%22instant%22:true%7D%5D,%22range%22:%7B%22from%22:%22now-5m%22,%22to%22:%22now%22%7D%7D&orgId=1).

## Tempo

Tempo is a backend store for longterm trace retention. More information can be found [here](https://grafana.com/docs/tempo/latest/).

The Tempo instance is described in the `tempo` section of the `docker-compose.yml` manifest.

The Tempo service imports a configuration file (`tempo/tempo.yaml`) that initialises the service with some sensible defaults as well as allowing the receiving of traces in a variety of different formats.

Tempo is also configured to generate metrics from incoming trace spans as part of it's configuration. As such, this no longer occurs via Grafana Agent (although the original configuration for the Agent to carry this out has been left in the Agent configuration file as a guide).

For an example of a span search, look at the Explorer page using the Tempo data source, [here](http://localhost:3000/explore?orgId=1&left=%7B%22datasource%22:%22tempo%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22datasource%22:%7B%22type%22:%22tempo%22,%22uid%22:%22tempo%22%7D,%22queryType%22:%22nativeSearch%22,%22serviceName%22:%22mythical-requester%22,%22minDuration%22:%22100ms%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D).

For an example of the mini-APM table and Service Graphs, use the 'Service Graph' tab [here](http://localhost:3000/explore?orgId=1&left=%7B%22datasource%22:%22tempo%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22datasource%22:%7B%22type%22:%22tempo%22,%22uid%22:%22tempo%22%7D,%22queryType%22:%22serviceMap%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D).

Traces are instrumented using the OpenTelemetry SDK, more details on which can be found [here](https://opentelemetry.io/docs/).
## Phlare

*Phlare is currently at version 0.1.x.*

Phlare is a continuous profiling backend store, and is the latest of the database products to be announced by Grafana. See [here](https://grafana.com/docs/phlare/latest/) for the latest documentation.

Phlare uses a configuration file (`phlare/phlare.yaml`) that is configured to scrape [pprof](https://github.com/google/pprof) profiles from the Mythical microservices.

pprof samples are scraped directly from the application on the `/debug/pprof/profile` endpoint (and supported using appropriate NPM modules).

You can see an example of profiling in action once the system is running by using the Explorer to visualise the profiles stored [here](http://localhost:3000/explore?orgId=1&left=%7B%22datasource%22:%22phlare%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22datasource%22:%7B%22type%22:%22phlare%22,%22uid%22:%22phlare%22%7D,%22labelSelector%22:%22%7B%7D%22,%22queryType%22:%22both%22,%22groupBy%22:%5B%5D,%22profileTypeId%22:%22process_cpu:sample:count:wall:microseconds%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D).

*Note:* Currently it can take a few minutes before enough profiling information is available. You may see an error until a few minutes have passed on initial startup.

## Grafana Agent

Grafana Agent is a locally installed agent that acts as:
* A Prometheus scraping service.
* A Tempo backend service receiver and trace span processor.
* A Promtail (Loki logs receiver) instance.

Grafana Agent has remote write capabilities that allows it to send metrics, logs and trace data to backend stores (such as Mimir, Loki and Tempo). More information on Grafana Agent can be found [here](https://grafana.com/docs/agent/latest/).

Its main role in this environment is to receive trace spans from the microservice application and process them to extract log information before storing them in the final backend stores.

It also defines several metrics scrape jobs, including:
* Retrieving metrics from the Prometheus instance itself.
* Metrics from the microservices application.
* Metrics from the installed Node Exporter instance.

All of these metrics are remotely written to the Mimir instance.

Note that the configuration now includes a commented section where metrics used to be generated from incoming trace spans; this is now handled directly in Tempo via server-side metrics generation, although the original configuration block has been left commented out in the Agent config.

The configuration file for it can be found in `agent/config.yaml`.

## Microservice Source

The source for the microservice application can be found in `source`. It is a three service application that utilises a Postgres database and AQMP bus to store data.

The services are written in JavaScript and execute as NodeJS scripts inside Docker containers.

The [`requester`](source/mythical-beasts-requester/index.js) services makes 'random' requests to the [`server`](source/mythical-beasts-server/index.js), which then inserts, retrieves or deletes data from the Postgres database. The `requester` service also stores data to the AQMP queue via the [`recorder`](source/mythical-beasts-recorder/index.js) service.

All three services use common code to deal with the [`queue`](source/common/queue.js), [`logging`](source/common/logging.js) and [`tracing`](source/common/tracing.js) requirements they have.

There is a common [`Dockerfile`](source/docker/Dockerfile) that is used to build all three services.

## Grafana Cloud

This demo can be run against Grafana Cloud using Docker Compose as follows:

1. Configure and source the Metrics, Logs and Traces environment variables in the file `cloud/envvars-grafana-cloud-unconfigured.sh` from a Grafana Cloud instance. Generally only the environment variables tagged with “__ID__” and “__API_KEY__” need to be updated, sometimes the _HOST variables will need to be modifyed.
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
