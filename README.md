# Building OpenTelemetry and Prometheus native telemetry pipelines with Grafana Alloy

<img width="917" alt="image" src="https://github.com/user-attachments/assets/9217f310-39c8-4baa-b748-0a19cc40a5ba" />
<img width="909" alt="image" src="https://github.com/user-attachments/assets/c74aef87-1586-4dbc-ba88-562ce96f4c2a" />
<img width="911" alt="image" src="https://github.com/user-attachments/assets/2c49f7f1-fff2-44a3-b271-4f2f82e1be07" />
<img width="914" alt="image" src="https://github.com/user-attachments/assets/002d5e98-863d-48e8-9fc2-1aa99e3716df" />

## Resources for the workshop

- [Mission repo](https://github.com/spartan0x117/intro-to-mltp/tree/main)
- [Grafana Alloy documentation](https://grafana.com/docs/alloy/latest/)
  - [Alloy configuration blocks](https://grafana.com/docs/alloy/latest/reference/config-blocks/)
  - [Alloy components](https://grafana.com/docs/alloy/latest/reference/components/)
  - [Collect and forward data with Grafana Alloy](https://grafana.com/docs/alloy/latest/collect/)
  - [Grafana Alloy Tutorials](https://grafana.com/docs/alloy/latest/tutorials/)

<img width="912" alt="image" src="https://github.com/user-attachments/assets/bc1467ea-b76b-4a8f-97af-91de818b07b6" />

## Environment set up
Before getting started, make sure you:
- install [Docker](https://www.docker.com/products/docker-desktop/) and [Docker Compose](https://docs.docker.com/compose/install/) 
- clone the [repo](https://github.com/spartan0x117/intro-to-mltp) for the lab environment :
```
git clone https://github.com/spartan0x117/intro-to-mltp.git
```
- start a new command-line interface in your Operating System and run: 
```
docker compose up --build -d
```
# Alloy 101 
<img width="909" alt="image" src="https://github.com/user-attachments/assets/d37cbbce-2526-443c-83e5-9c0a3a6b481d" />
<img width="911" alt="image" src="https://github.com/user-attachments/assets/d0f35b76-3aa0-48c6-8678-8310ffc29cdc" />
<img width="908" alt="image" src="https://github.com/user-attachments/assets/daf627f6-f743-4eda-b821-1794aabac1a9" />
<img width="911" alt="image" src="https://github.com/user-attachments/assets/f2aca8c7-a63c-4735-aceb-c5f64155cefc" />
<img width="912" alt="image" src="https://github.com/user-attachments/assets/85f2ea42-93d3-4477-be06-edaf84af1800" />
<img width="907" alt="image" src="https://github.com/user-attachments/assets/d669cbc0-dad6-4997-99dc-fed755b3c295" />
<img width="916" alt="image" src="https://github.com/user-attachments/assets/8e8422f6-205b-46e0-b19c-09eb4dbebd31" />
<img width="915" alt="image" src="https://github.com/user-attachments/assets/87e09054-937f-429e-a9e2-7167e1bf65ff" />

## Alloy syntax

### Think of Alloy as our secret weapon that can collect, transform, and deliver our telemetry data. 

To instruct Alloy on how we want that done, we must write these instructions in a language (`Alloy syntax`) that Alloy understands. 

![Alt Text](https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExemZxYWc0MzNuczMyYXNmcjkxdDg4Njg2amw0MmJ5anIxbzNjczdlZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Mb9dQnfZXSBYMhU2Nv/giphy.gif)

<img width="953" alt="image" src="https://github.com/user-attachments/assets/1d69eaf5-9508-4de1-990d-432d7668ec50" />
<img width="937" alt="image" src="https://github.com/user-attachments/assets/1ecaad57-caea-4e5c-b462-22eb14e7a6cd" />
<img width="943" alt="image" src="https://github.com/user-attachments/assets/46bb6241-a41f-4975-a700-6f35eff20286" />
<img width="942" alt="image" src="https://github.com/user-attachments/assets/5230684e-e7c6-40d1-8148-40a02e0219f5" />

### When figuring out which components to use, focus your attention to what comes after the name of the ecosystem to figure out what that component does. 

<img width="944" alt="image" src="https://github.com/user-attachments/assets/28d46b11-664a-43fb-ae96-095d3c9c5173" />
<img width="944" alt="image" src="https://github.com/user-attachments/assets/31bda298-1b8a-474f-8a05-b291e406c758" />
<img width="948" alt="image" src="https://github.com/user-attachments/assets/e9a9d603-9a30-4116-9cde-346ee8051a9f" />
<img width="938" alt="image" src="https://github.com/user-attachments/assets/1250387f-7e0e-4577-8ecb-332af321730c" />
<img width="940" alt="image" src="https://github.com/user-attachments/assets/56e5dbdf-57d1-43bb-87b7-6e1cf6efb13e" />
<img width="908" alt="image" src="https://github.com/user-attachments/assets/47390611-2110-4609-b639-08d15d13ddcd" />

### While reading up on components within the Alloy docs, pay special attention to the following sections:
- usage
- arguments
- blocks

The `usage` section gives you an example of how this particular component could be configured. 
<img width="911" alt="image" src="https://github.com/user-attachments/assets/add64bd4-0831-46eb-9041-0757eaae8d67" />

The `arguments` and `blocks` sections list what you could do with the data. Pay close attention to the name, type, description, default, and required columns so Alloy could understand what you want it to do! 
<img width="911" alt="image" src="https://github.com/user-attachments/assets/53b1ecea-5818-420e-bc10-151309afd9d8" />
<img width="914" alt="image" src="https://github.com/user-attachments/assets/a4ae1137-1ff6-423d-8977-28246e1bbe0e" />

# Tactical training 

## Lab environment overview
<img width="1433" alt="image" src="https://github.com/user-attachments/assets/6fd37912-58ab-4620-a246-6babc04d8f5d" />

## Common tasks
We will be using the `config.alloy` file to build pipelines for Infrastructure Observability and Applications Observability. 

Whenever we make changes to the file, we must reload the config. 

### Reloading the config

To reload Alloy's config, hit the following endpoint in a browser or with a tool like `curl`:

```bash
curl -X POST http://localhost:12347/-/reload
```

If the config is valid, you should see a response like the following:

```
config reloaded
```
## Infrastructure Observability - collect, transform, and export logs and metrics
### Section 1: Collect and transform logs from Alloy
#### Objectives

- Collect logs from Alloy using the [`logging`](https://grafana.com/docs/alloy/latest/reference/config-blocks/logging/) block
- Use [`loki.relabel`](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.relabel/) to add labels to the logs
- Use [`loki.write`](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.write/) to write the logs to Loki

#### Instructions

Open `config.alloy` in your editor and copy the following starter code into it:

```alloy/config.alloy
//Section 1

logging {
  format = "//TODO: Fill this in"
  level  = "//TODO: Fill this in"
  write_to = [//TODO: Fill this in]
}

loki.relabel "alloy_logs" {
   forward_to = [//TODO: Fill this in]

    rule {
        target_label = "//TODO: Fill this in"
        replacement = "//TODO: Fill this in"
    }

    rule {
        target_label = "//TODO: Fill this in"
        replacement = "//TODO: Fill this in" 
    }
}

loki.write "mythical" {
    endpoint {
       url = "//TODO: Fill this in"
    } 
}
```

For the `logging` block, we want to set the log format to "logfmt" and the log level to "debug" and write the logs to the `loki.relabel.alloy_logs` component's receiver.

For the `loki.relabel` component, we want to set the `group` label to "infrastructure" and the `service` label to "alloy" and forward the logs to the `loki.write.mythical` component's receiver.

For the `loki.write` component, we want to ship the logs to `http://loki:3100/loki/api/v1/push`.

<img width="910" alt="image" src="https://github.com/user-attachments/assets/887f206b-683f-4107-aaf3-cb891c2226d1" />

### Reloading the config

To reload Alloy's config, hit the following endpoint in a browser or with a tool like `curl`:

```bash
curl -X POST http://localhost:12347/-/reload
```

If the config is valid, you should see a response like the following:

```
config reloaded
```

#### Verification

Navigate to the [Dashboards](http://localhost:3000/dashboards) page and select the `Section 1 Verification` dashboard.

You should see the panels populated with data, showing the number of logs being sent by Alloy as well as the logs themselves.

<img width="911" alt="image" src="https://github.com/user-attachments/assets/07d04e94-caa5-4316-92dc-a50ebfdb333a" />

### Section 2: Collect and transform infrastructure metrics

#### Objectives

- Use the [discovery.http](https://grafana.com/docs/alloy/latest/reference/components/discovery/discovery.http/) component to discover the targets to scrape
- Scrape the targets' metrics using the [`prometheus.scrape`](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.scrape/) component
- Use [`prometheus.remote_write`](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.remote_write/)to write the metrics to the locally running Mimir

We are going to introduce a new component called service discovery (`discovery.http`). 

When you are observing your infrastructure/applications, it's likely that you are working with a dynamic environment.
<img width="907" alt="image" src="https://github.com/user-attachments/assets/f420f7c3-87c6-40c6-9be4-d594aa498338" />


There could be 1000 servers going up and down whose names and addresses you don't know.
<img width="908" alt="image" src="https://github.com/user-attachments/assets/fe1aae3a-4552-4c1a-8c34-6d05e18b1be6" />

You want to avoid having to manage this ever-changing list of things to scrape and get metrics from yourself.

For example, let's say you are working with Amazon instances. Instead of hard coding all the names and addresses, you could reach out to an Amazon endpoint and have it find all of the instances for you and expose those as targets so alloy could scrape it.



#### Instructions

Open `config.alloy` in your editor and copy the following code into it:

```alloy
//Section 2
discovery.http "service_discovery" {
    url = "//TODO: Fill this in"
    refresh_interval = "2s"
}

prometheus.scrape "infrastructure" {
    scrape_interval = "2s"
    scrape_timeout  = "2s"

    targets    = //TODO: Fill this in
    forward_to = [//TODO: Fill this in]
}

prometheus.remote_write "mimir" {
   endpoint {
    url = "//TODO: Fill this in"
   }
}
```

In this section, we will be using the `discovery.http` component to ping an HTTP within our lab envirohment in charge of finding targets: "http://service-discovery/targets.json"

This http endpoints are aware of all instances of loki, tempo, mimir, and pyroscope databases that are currently running within our environment

We will use a `prometheus.scrape` component to scrape metrics from the discovered targets.

As a last step, we will configure the `prometheus.remote_write` component to write the metrics to a local Mimir database ("http://mimir:9009/api/v1/push")

<img width="912" alt="image" src="https://github.com/user-attachments/assets/845a4274-65e4-46da-868b-0fb71a8f92be" />

Don't forget to [reload the config](#reloading-the-config) after finishing.

#### Verification

Navigate to the [Dashboards](http://localhost:3000/dashboards) page and select the `Section 2 Verification` dashboard.

You should see an `up` value of 1 for the Loki, Mimir, Tempo, and Pyroscope services.

<img width="911" alt="image" src="https://github.com/user-attachments/assets/a7f7d7f8-e0d8-4cc2-b76a-c0d03e55d8d5" />

#### Alloy UI

Alloy UI is a useful tool that helps you visualize how Alloy is configured and what it is doing so you are able to debug efficiently. 

Navigate to localhost:12347 to see the list of components (orange box) that alloy is currently configured with.
Click on the blue ‘view’ button on the right side (red arrow).
<img width="914" alt="image" src="https://github.com/user-attachments/assets/5f4ac3f7-ab05-43f2-9840-0bac97a59fdd" />

You will see details (green box) about what this component is configured with and what it is exporting.
You can also access the links to view the documentation (orange arrow) for the component and the live debugging feature (yellow arrow). 
<img width="907" alt="image" src="https://github.com/user-attachments/assets/84934f68-4964-4203-9dd5-47693d1a7505" />

Navigate to the ‘Graph’ tab (blue arrow) to access the graph of components and how they are connected.

The number (red box) shown on the dotted lines shows the rate of transfer between components. The window at the top (orange box) configures the interval over which alloy should calculate the per-second rate, so a window of ‘10’ means that alloy should look over the last 10 seconds to compute the rate.

The color of the dotted line signifies what type of data are being transferred between components. See the color key (purple box) for clarification. 

<img width="910" alt="image" src="https://github.com/user-attachments/assets/95b20759-971f-410d-9598-d5db3213eef7" />

The Clustering tab (green box) shows the nodes in the Alloy cluster. Clustering is used to distribute scrape targets among one or more Alloy instances that you have configured to operate in the same cluster. Clustering is only available for some components, and to keep things simple we will not be covering it in this workshop.

If you’re curious, the [documentation](https://grafana.com/docs/alloy/latest/get-started/clustering/) covers more about clustering.

<img width="916" alt="image" src="https://github.com/user-attachments/assets/f39f322c-d0dc-420e-b3d3-4e2777c8c326" />


### Section 3: Collect and transfrom metrics from Postgres DB

#### Objectives

- Expose metrics from the Postgres DB using the [`prometheus.exporter.postgres](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.exporter.postgres/) component
- Collect metrics from Postgres using the [`prometheus.scrape`](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.scrape/) component
- Use the [`prometheus.relabel`](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.relabel/) to 
  - add the `group="infrastructure"` and `service="postgres"` labels
  - replace the value of 'instance' label for a value that matches the regex ("^postgresql://([^/]+)")
- [Write](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.remote_write/) the metrics to Mimir

#### Instructions

Open `config.alloy` in your editor and copy the following code into it:

```alloy
//Section 3
prometheus.exporter.postgres "mythical" {
    data_source_names = ["postgresql://postgres:mythical@mythical-database:5432/postgres?sslmode=disable"]
}

prometheus.scrape "postgres" {
    scrape_interval = "2s"
    scrape_timeout  = "2s"

    targets    =  TODO: Fill this in
    forward_to =  [//TODO: Fill this in]
}

prometheus.relabel "postgres" {
    forward_to =  [//TODO: Fill this in]

    rule {
        target_label = "//TODO: Fill this in"
        replacement  = "//TODO: Fill this in"
    }
    
    rule {
        target_label = "//TODO: Fill this in"
        replacement  = "//TODO: Fill this in"
    }

 //What we have: postgres_table_rows_count{instance="postgresql://mythical-database:5432/postgres"}
 //What we want: postgres_table_rows_count{instance="mythical-database:5432/postgres"}
    
    rule {
        // Replace the targeted label.
        action        = "//TODO: Fill this in"

        // The label we want to replace is 'instance'.
        target_label  = "//TODO: Fill this in"

        // Look in the existing 'instance' label for a value that matches the regex.
        source_labels = ["//TODO: Fill this in"]
        regex         = "^postgresql://(.+)"
        
        // Use the first value found in the 'instance' label that matches the regex as the replacement value.
        replacement   = "$1"
    }
}
```

For the `prometheus.scrape` component, we want to scrape the `prometheus.exporter.postgres.mythical` component's targets and forward the metrics to the `prometheus.relabel.postgres` component's receiver.

For the `prometheus.relabel` component, we want to add the `group="infrastructure"` and `service="postgres"` labels to the metrics.

We also want to modify the `instance` label to clean it up. The regex `"^postgresql://(.+)"` will extract the value after `postgresql://`.

<img width="909" alt="image" src="https://github.com/user-attachments/assets/41d4f468-62c3-46cd-8694-efa2424049c2" />

Don't forget to [reload the config](#reloading-the-config) after finishing.

#### Verification

Navigate to Dashboards > `Section 3 Verification` and you should see a dashboard populating with Postgres metrics. 
You should also see an instance value of `mythical-database:5432/postgres` instead of `postgresql://mythical-database:5432/postgres`.

<img width="910" alt="image" src="https://github.com/user-attachments/assets/5907b198-b732-4b7d-a0a5-65dcf47f7e4c" />

## Application Observability - collect, transform, and export traces and logs

### Section 4: Collect and transform metrics from Mythical-Services

#### Objectives

- Collect metrics from the Mythical services using the [`prometheus.scrape`](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.scrape/) component
- [Write](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.remote_write/) metrics to locally running Mimir using the [`prometheus.write.queue`](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.write.queue/) component

#### Instructions

Open `config.alloy` in your editor and copy the following code into it:

```alloy
//Section 4
prometheus.scrape "mythical" {
    scrape_interval = "2s"
    scrape_timeout  = "2s"

    targets    =  [
        {"__address__"= "//TODO: Fill this in", group = "//TODO: Fill this in", service = "//TODO: Fill this in"},
        {"//TODO: Fill this in"}, 
        ]
    forward_to =  [//TODO: Fill this in]
}

prometheus.write.queue "experimental" {
    endpoint "mimir" {
        url = "//TODO: Fill this in"
    }
}

```
For the `prometheus.scrape` component, we can define scrape targets for mythical services directly by creating a scrape object. Scrape targets are defined as a list of maps, where each map contains a `__address__` key with the address of the target to scrape. 

Any non-double-underscore keys are used as labels for the target.
For example, the following scrape object will scrape Mimir's metrics endpoint and add `env="demo"` and `service="mimir"` labels to the target:

```alloy
targets = [{"__address__" = "mimir:9009",  env = "demo", service = "mimir"}]
```

For this exercise, create two targets using the following addresses. 

- "mythical-server:4000"
- "mythical-requester:4001"

Add the following labels for each target. 
- mythical-server:
  - group = "mythical", service = "mythical-server"
- mythical-requester:
  - group = "mythical", service = "mythical-requester"

Forward the metrics to the `prometheus.write.queue` component we will define next. 

`prometheus.write.queue` component writes metrics to the url of the database we specify. 

Similar to `prometheus.remote_write` component, we use the `endpoint` block we label as "mimir". 
We set the `url` equal the address of the locally running Mimir: "http://mimir:9009/api/v1/push"

<img width="915" alt="image" src="https://github.com/user-attachments/assets/6c7ebcef-c963-41d6-ba6d-a5805c8104d6" />

Don't forget to [reload the config](#reloading-the-config) after finishing.

#### Verification

Navigate to Dashboards > `Section 4 Verification` and you should see a panel with the request rate per beast flowing!

<img width="909" alt="image" src="https://github.com/user-attachments/assets/e3271544-b277-4114-a969-733ce4da064b" />

### Section 5: Ingesting OTel traces

#### Objectives

- [Receive](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.receiver.otlp/) spans from the Mythical services and Beyla
- [Batch spans](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.processor.batch/) for efficient processing
- [Write](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.exporter.otlp/) the spans to a local instance of Tempo

#### Instructions

Open `config.alloy` in your editor and copy the following code into it:

```alloy
//Section 5
otelcol.receiver.otlp "otlp_receiver" {
    grpc {
        endpoint = "//TODO: Fill in the default value shown in the doc"
    }
    http {
        endpoint = "//TODO: Fill in the default value shown in the doc"
    }
    output {
        traces = [
            //TODO: Fill this in,
        ]
    }
}

otelcol.processor.batch "default" {
    output {
        traces = [
            //TODO: Fill this in,
            ]
    }

    send_batch_size = //TODO: Fill this in 
	  send_batch_max_size = //TODO: Fill this in

	  timeout = "//TODO: Fill this in"
}

otelcol.exporter.otlp "tempo" {
    client {
        endpoint = "//TODO: Fill this in"

        // This is a local instance of Tempo, so we can skip TLS verification
        tls {
            insecure             = true
            insecure_skip_verify = true
        }
    }
}


```
`otelcol.receiver.otlp`

- To configure the `otelcol.receiver.otlp` component, open the doc for the [otelcol.receiver.otlp](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.receiver.otlp/) component
- Find the default port for grpc and set its endpoint equal to it.
- Find the default port for http and set its endpoint equal to it. 
- Using the `output` block, send the traces to the input of the `otelcol.processor.batch` component we will define next. 

`otecol.processor.batch`

- The batch processor will batch spans until a batch size or a timeout is met, before sending those batches on to another component. 
- Let's configure it to batch minimum 1000 spans, up to 2000 spans, or until 2 seconds have elapsed.
- Using the `output` block, send the batched traces to the input of the `otelcol.exporter.otlp` component we will define next.

`otelcol.exporter.otlp`

- Using the `client` block, write batches of spans to a local instance of Tempo
- The Tempo url is http://tempo:4317.

<img width="915" alt="image" src="https://github.com/user-attachments/assets/1e3dedbe-d69b-47b6-b7e0-ee3a2ae740e7" />

Don't forget to [reload the config](#reloading-the-config) after finishing.

#### Verification

Navigate to [Dashboards](http://localhost:3000/dashboards) > `Section 5 Verification` and you should see a dashboard with a populated service graph, table of traces coming from the mythical-requester, and the rate of span ingestion by Tempo

<img width="917" alt="image" src="https://github.com/user-attachments/assets/564236f6-e3b5-430c-a963-2f7509960e5c" />

You can also navigate to [Dashboards](http://localhost:3000/dashboards) > `MLT Dashboard`. These dashboards are configured to use the metrics
from Spanmetrics, so you should see data for the spans we're ingesting.

<img width="914" alt="image" src="https://github.com/user-attachments/assets/d0822e32-0af2-4f13-b6de-2c037d2e8a93" />

### Section 6: Ingesting application logs

#### Objectives

- Ingest the logs that are being sent by the mythical services to port 3100
- Add a `service=”mythical”` label to logs
- Use stage.regex and stage.timestamp to extract the timestamp from the log lines and set the log’s timestamp

<img width="914" alt="image" src="https://github.com/user-attachments/assets/d9c8dbc0-29ed-460b-b487-8440075cec59" />
<img width="913" alt="image" src="https://github.com/user-attachments/assets/8b8afaa5-ade1-4c5a-9935-6ccb607af0f9" />

#### Instructions

Open `config.alloy` in your editor and copy the following code into it:

```alloy
//Section 6
loki.source.api "mythical" {
     http {
        listen_address = "0.0.0.0"
        listen_port    = "3100"
    }
    forward_to = [//TODO: Fill this in]
}

loki.process "mythical" {
    stage.static_labels {
        values = {
           //TODO: Fill this in = "//TODO: Fill this in",        
        }
    }
   stage.regex {
        expression=`^.*?loggedtime=(?P<loggedtime>\S+)`
   }

   stage.timestamp {
        source = "//TODO: Fill this in"
        format = "2006-01-02T15:04:05.000Z07:00"
    }

    forward_to = [loki.write.mythical.receiver]
}
```

- Ingest application logs sent from the mythical services using the [`loki.source.api`](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.api/) component
- Use the [`loki.process`](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.process/) component to:
  - add a static `service="mythical" label
  - extract the timestamp from the log line using `stage.regex` with this regex: `^.*?loggedtime=(?P<loggedtime>\S+)`
  - set the timestamp of the log to the extracted timestamp
  - Forward the processed logs to Loki
#### Verification

Navigate to Dashboards > `Section 6 Verification` and you should see a dashboard with the rate of logs coming from the mythical apps as well as panels showing the logs themselves for the server and requester

<img width="913" alt="image" src="https://github.com/user-attachments/assets/01b5718b-aa1c-47d6-92a1-206aca81066c" />

### Section 7: Spanlogs

#### Objectives

- Take the traces we're already ingesting and [convert them to logs (spanlogs)](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.connector.spanlogs/)
- [Convert](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.exporter.loki/) the logs to Loki-formatted log entries and forward them to the `loki.processor`. 
- Use [`loki.process`](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.process/) to convert the format and add attributes to the logs
- Forward the processed logs to Loki

#### Instructions

Open `config.alloy` in your editor and copy the following code into it:

```alloy
//Section 7
otelcol.connector.spanlogs "autologging" {
    roots = // TODO: Fill this in
    spans = // TODO: Fill this in
    processes = // TODO: Fill this in

    span_attributes = ["// TODO: Fill this in", "// TODO: Fill this in", "// TODO: Fill this in"]
    //these are the span attributes that I would like to include in the logs

    output {
    logs = [// TODO: Fill this in]
  }
}

otelcol.exporter.loki "autologging" {
    forward_to = [// TODO: Fill this in]
}

// The Loki processor allows us to accept a Loki-formatted log entry and mutate it into
// a set of fields for output.
loki.process "autologging" {
    stage.json {
       expressions = {"body" = ""}
    }

    stage.output {
       source = "body"
    }

    stage.logfmt {
        mapping = {
            http_method_extracted = "// TODO: Fill this in",
            http_status_code_extracted = "// TODO: Fill this in", 
            http_target_extracted = "// TODO: Fill this in", 

        }
    }

    stage.labels {
        values = {
            method = "// TODO: Fill this in", 
            status = "// TODO: Fill this in",
            target = "// TODO: Fill this in", 
        }
    }

    forward_to = [// TODO: Fill this in]
}
```
**`otelcol.connector.spanlogs`**

For the `otelcol.connector.spanlogs` component to work, we will need to forward the spans from the `otelcol.receiver.otlp`'s output > traces we have defined in section 5 to the `otelcol.connector.spanlogs`'s input.

We'd like to make sure to only generate a log for each full trace(root), not for each span or process (that would be a lot of logs!).

We should also make sure to include the `http.method`,`http.status_code`, `http.target` attributes in the logs.

Then send the generated logs to the `otelcol.exporter.loki`'s input. 

**`otelcol.exporter.loki`** 

This component accepts OTLP-formatted logs from other otelcol components and converts them to Loki-formatted log entries without further configuration. 

Forward the Loki-formatted logs to the `loki.process "autologging"`'s receiver for further processing. 

**`loki.process`**

Use this component to:
  - Convert the body from JSON to logfmt using the `stage.json` and `stage.logfmt` stages
  - Add the `method`, `status`, and `target` labels from the `http.method`, `http.status_code`, and `http.target` attributes

<img width="917" alt="image" src="https://github.com/user-attachments/assets/10aaff15-6561-4c6a-b21b-9d1f2a2d5be5" />

Don't forget to [reload the config](#reloading-the-config) after finishing.

#### Verification

Navigate to Dashboards > `Section 7 Verification` and you should see a dashboard with panels containing the rate of spanlog ingestion as well as the spanlogs themselves.

<img width="910" alt="image" src="https://github.com/user-attachments/assets/07cea252-4ba4-489b-957f-eaaeccb07418" />

<img width="911" alt="image" src="https://github.com/user-attachments/assets/fa6b332e-9f32-4844-8213-263f68427ba3" />


### Mission 1

#### Description

One of our trusted informants has stashed an encrypted file—`secret_message.txt.enc`—on a remote dead-drop.

The decryption key? Hidden in plain sight, embedded in an internal label on the service discovery targets.
Since internal labels are stripped before metrics make it to Mimir, this covert tactic kept the key out of enemy hands.

Your mission: use Alloy to uncover the hidden key, decrypt the message, and reveal the intel within.

#### Objectives

- Use the Alloy UI to find the key hidden in the internal label on the service discovery targets
- Decode the key and decrypt the secret message

#### Instructions

Access the [Alloy UI](http://localhost:12347) and look for the hidden key on one of the service discovery targets.

To decrypt and print the AES-256-CBC encrypted secret message, run the following command in the terminal at the root of the lab repo directory, using the key you just found:
`openssl enc -aes-256-cbc -d -salt -pbkdf2 -in secret_message.txt.enc -k '<key>'`

#### Verification

You should see the secret message in the console!

### Mission 2

#### Description

A rogue actor has tampered with IMF's monitoring systems, slipping a high-cardinality instance_id label into a metric that counts database calls.

This unexpected spike in cardinality is putting Mimir under serious pressure -- and it's up to us to defuse the situation before it blows.

You can see the dashboard that informed the IMF that this was happening by navigating to [Dashboards](http://localhost:3000/dashboards) > `Mission 2`.

But it's not all bad news. Hidden within the instance_id is valuable intel: the name of the cloud provider.
IMF wants us to extract that information and promote it to a dedicated cloud_provider label—transforming this mess into a mission success.

IMF has equipped you with the following regex to help you complete this mission:
`^(aws|gcp|azure)-.+`

#### Objectives

- Using `prometheus.relabel`, use the provided regex to replace the `cloud_provider` label with the extracted value from the `instance_id` label.
- Drop the `instance_id` label.

#### Instructions

For this exercise, you may find the following components useful:

- [prometheus.relabel](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.relabel/)

Go back to the portion of config from Section 4, where we started scraping metrics from the mythical services. Paste the following in above the `prometheus.write.queue` component (**note**: the order of components does not matter, this is just for organization and readability):

```alloy
prometheus.relabel "mission_2" {
    forward_to = [prometheus.write.queue.experimental.receiver]

  //write a relabel rule to extract the cloud provider from the instance_id label and add it as a new label called cloud_provider
    rule {
        action        = "// TODO: Fill this in"
        target_label  = "// TODO: Fill this in"
        source_labels = ["// TODO: Fill this in"]
        regex         = "^(aws|gcp|azure)-.+"
        replacement   = "$1"
    }

    // drop the instance_id label from metrics
    rule {
        action  = "// TODO: Fill this in"
        regex   = "// TODO: Fill this in"
    }
}
```

#### Verification

Navigate to the [Explore](http://localhost:3000/explore) page and look at the metrics.
Query for `count by (cloud_provider) (rate(mythical_db_request_count_total [$__rate_interval]))` and you should see a non-zero value.

<img width="909" alt="image" src="https://github.com/user-attachments/assets/7a2fc73e-03ea-4e5c-be12-e4053027172c" />

### Mission 3

After much debate, the various departments within IMF have reached a rare consensus: it's time to standardize the attribute name for service tiers.
Until now, teams have been using conflicting keys like `servicetier` and `tier`, creating chaos in spanmetrics and cross-department dashboards.

Headquarters has spoken: `service.tier` is the new standard.

Your mission: use Alloy to bring order to the data.
Standardize the attribute across the board so that spanmetrics flow smoothly and dashboards speak a common language.

#### Objectives

- Use the [`otelcol.processor.attributes`](https://grafana.com/docs/agent/latest/flow/reference/components/otelcol.processor.attributes/) component to set the `service.tier` attribute to the value of
  the `servicetier` or `tier` attributes.
- Drop the `servicetier` and `tier` attributes.

#### Instructions

The [`otelcol.processor.attributes`](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.processor.attributes/) component allows you to add, set, or drop attributes.

Go back to the portion of config from Section 5, where we received traces from the mythical services. Paste the following  above the `otelcol.processor.batch.default` component (**note**: the order of components does not matter, this is just for organization and readability):

```alloy
otelcol.processor.attributes "mission_3" {
    // These two actions are used to add the service.tier attribute to spans from
    // either the servicetier or tier attributes.
    action {
        action         = "//TODO: Fill this in"
        key            = "//TODO: Fill this in"
        from_attribute = "//TODO: Fill this in"
    }
    action {
        action         = "//TODO: Fill this in"
        key            = "//TODO: Fill this in"
        from_attribute = "//TODO: Fill this in"
    }

    // This isn't required, but shows how to exclude the attributes we just copied.
    exclude {
        match_type = "strict"

        attribute {
            key = "//TODO: Fill this in"
        }

        attribute {
            key = "//TODO: Fill this in"
        }
    }

    output {
        traces = [otelcol.processor.batch.default.input]
    }
}
```

#### Verification

Navigate to [Dashboards](http://localhost:3000/dashboards) > `Mission 3` and you should see a dashboard with data including the new `service_tier` label, which came from spanmetrics generation using the `service.tier` attribute we just consolidated.

<img width="909" alt="image" src="https://github.com/user-attachments/assets/db5b980b-83b1-4c92-9d19-b33e50a52530" />


### Mission 4

#### Description

The IMF needs your expertise for one final mission.
An opposing state actor exploited a Zero-Day vulnerability in one of our servers, causing sensitive tokens to be logged by the mythical-requester.

The security team is standing by, but before they can act, we need to make sure no tokens are being written to Loki.
Your task: use Alloy to identify and redact any sensitive tokens from the mythical-service logs—effectively, clean up the trail and keep things secure.

Navigate to [Dashboards](http://localhost:3000/dashboards) > `Mission 4`. You will see logs coming in with sensitive token information. 

#### Objectives

- Redact any tokens found in the logs from the mythical services

#### Instructions

Take a look at the [`loki` components](https://grafana.com/docs/alloy/latest/reference/components/loki/). Are there any that seem like they could be useful for this mission?

Which section would you add this component to and how would you have to change the previous configuration? 

#### Verification

Navigate to [Dashboards](http://localhost:3000/dashboards) > `Mission 4` and you should see a dashboard with a
panel showing the rate of logs with tokens coming from the mythical services as well as the logs themselves with the secret token redacted. 

<img width="913" alt="image" src="https://github.com/user-attachments/assets/02151116-d8c5-4aa1-844a-6c6d9a32285a" />

<img width="912" alt="image" src="https://github.com/user-attachments/assets/4f066278-ba62-4a0e-b905-75d1c4f25a34" />
<img width="912" alt="image" src="https://github.com/user-attachments/assets/ae9e8f4a-9fcc-435d-bbf6-7b482b01c87a" />
<img width="915" alt="image" src="https://github.com/user-attachments/assets/ed565c8c-31e8-47f6-bc20-893e73b70eb6" />
<img width="913" alt="image" src="https://github.com/user-attachments/assets/15e5a2cb-0e8f-46f0-b93e-4e32e27b992d" />


# Q & A

