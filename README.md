# Introduction to Metrics, Logs and Traces in Grafana

This is the companion repository to a series of presentations over the three pillars of
observability within Grafana.

It is presented as a self-enclosed Docker sandbox that includes all of the components required to run on a local machine and experiment with the services provided.

## Prerequisites

The following demonstration environment requires:
* [Docker](https://www.docker.com/products/docker-desktop/)
* [Docker Compose](https://docs.docker.com/compose/install/)

## Overview
The demos from this series were based on the application and code in this repository, which includes:

* Docker Compose manifest for easy setup.
* Three-service application:
  * A service requesting data from a REST API server.
  * A REST API server that receives requests and utilises a Database for storing/retrieving data for those requests.
  * A Postgres Database for storing/retrieving data from.
* Tempo instance for storing trace information.
* Loki instance for storing log information.
* Prometheus instance for storing metric information.
* Grafana instance for visualising observability information.
* Grafana Agent instance for receiving traces and producing metrics and logs based on these traces.
* A Node Exporter instance to retrieve resource metrics from the local host.

## Running the Demonstration Environment

Docker Compose will download the required Docker images, before starting the demonstration environment. Data will be emitted from the microservice application and be stored in Loki, Tempo and Prometheus. You can login to the Grafana instance to visualise this data. To execute the environment and login:

1. Start a new command-line interface in your Operating System and run:
   ```bash
   docker-compose up
   ```
2. Login to the local Grafana instance at http://localhost:3000/
   *NOTE:* This assumes that port 3000 is not already in use. If this port is not free, edit the `docker-compose.yml` file and alter the line
   ```
   - "3000:3000"
   ```
   to some other host port that is free, for example:
   ```
   - "3123:3000"
   ```
3. Navigate to the [MLT dashboard](http://localhost:3000/d/4VSk5Lank/mlt-dashboard?orgId=1&refresh=5s).
4. Explore the data sources using the [Grafana Explorer](http://localhost:3000/explore?orgId=1&left=%7B%22datasource%22:%22Prometheus%22,%22queries%22:%5B%7B%22refId%22:%22A%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D).

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

## Prometheus

Prometheus is a backend store and service for scraping (pulling) metrics data from various sources. More information can be found [here](https://prometheus.io/). Additionally, Mimir is a long-term retention store for Prometheus data, information on which can be found [here](https://grafana.com/docs/mimir/latest/).

The Prometheus instance is described in the `prometheus` section of the `docker-compose.yml` manifest.

It is built from a modified Dockerfile in the `prometheus` directory. This copies a configuration file into the new image as well as enables several features (including Exemplar support) by modifying the command string used on startup. Prometheus exposes its main interface on port `9090`.

The configuration file (`prometheus/prometheus.yml`) defines several scrape jobs, including:
* Retrieving metrics from the Prometheus instance itself.
* Metrics from the microservices application.
* Metrics from the installed Node Exporter instance.

Additionally to the scraped metrics, it also receives remotely written metrics from the Tempo service, which derives metrics from incoming trace spans.

## Loki

Loki is a backend store for longterm log retention. More information can be found [here](https://grafana.com/docs/loki/latest/).

The Loki instance is described in the `loki` section of the `docker-compose.yml` manifest.

This instance is simply the `latest` Loki image available, and exposes its interface on port `3100`.

The microservices application sends its logs directly to the Loki instance in this environment, via its REST API.

## Tempo

Tempo is a backend store for longterm trace retention. More information can be found [here](https://grafana.com/docs/tempo/latest/).

The Tempo instance is described in the `tempo` section of the `docker-compose.yml` manifest.

The Tempo service imports a configuration file (`tempo/tempo.yaml`) that initialises the service with some sensible defaults as well as allowing the receiving of traces in a variety of different formats.

As of Tempo 1.4, the ability to also automatically generate metrics from incoming trace spans is included. As such, this no longer occurs via Grafana Agent.

## Grafana Agent

Grafana Agent is a locally installed agent that acts as:
* A Prometheus scraping service.
* A Tempo backend service receiver and trace span processor.
* A Promtail (Loki logs receiver) instance.

Grafana Agent has remote write capabilities that allows it to send metrics, logs and trace data to backend stores (such as Mimir, Loki and Tempo). More information on Grafana Agent can be found [here](https://grafana.com/docs/agent/latest/).

Its main role in this environment is to receive trace spans from the microservice application and process them to extract log information before storing them in the final backend stores.

Note that the config now includes a commented section where metrics used to be generated from incoming trace spans; this is now handled directly in Tempo via server-side metrics generation, although the original configuration block has been left commented out in the Agent config.

The configuration file for it can be found in `agent/config.yaml`.
