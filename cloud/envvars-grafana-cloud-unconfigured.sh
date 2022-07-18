# Grafana Cloud Configuration
# API Access to A Grafana Stack, Metrics and Logs
#
# Grafana Stack (Managed API Key)
export GRAFANA_STACK_URL="https://__SLUG__.grafana.net"
export GRAFANA_STACK_API_KEY=""
#
# Grafana Metrics Endpoint
# See: https://grafana.com/docs/grafana-cloud/metrics-prometheus/
export GRAFANA_METRICS_KEY_NAME="Metrics-Admin-DD-MM-YYYY"
export GRAFANA_METRICS_HOST="prometheus-prod-10-prod-us-central-0.grafana.net"
export GRAFANA_METRICS_USERNAME="__ID__"
export GRAFANA_METRICS_API_KEY="__API_KEY__"
export GRAFANA_METRICS_QUERY_URL="https://$GRAFANA_METRICS_HOST/api/prom/api/v1"
export GRAFANA_METRICS_WRITE_URL="https://$GRAFANA_METRICS_HOST/api/prom/push"
#
# Grafana Logs Endpoint
# See: https://grafana.com/docs/loki/latest/api/
export GRAFANA_LOGS_KEY_NAME="Logs-Admin-DD-MM-YYYY"
export GRAFANA_LOGS_HOST="logs-prod3.grafana.net"
export GRAFANA_LOGS_USERNAME="__ID__"
export GRAFANA_LOGS_API_KEY="__API_KEY__"
export GRAFANA_LOGS_QUERY_URL="https://$GRAFANA_LOGS_HOST/loki/api/v1"
export GRAFANA_LOGS_WRITE_URL="https://$GRAFANA_LOGS_HOST/loki/api/v1/push"
#
# Grafana Traces Endpoint
export GRAFANA_TRACES_KEY_NAME="Traces-Admin-DD-MM-YYYY"
export GRAFANA_TRACES_USERNAME="__ID__"
export GRAFANA_TRACES_API_KEY="__API_KEY__"
export GRAFANA_TRACES_HOST="tempo-us-central1.grafana.net:443"
#
#
# End