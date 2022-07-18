#!/bin/bash
#
#
CMD=${1:-"help"}
CMD_ARG1=${2:-"test1"}

GRAFANA_PROMTAIL_CONFIG_FILE="promtail-config.yml"
SHARED_DIR="container_dir"
DOWNLOADS_DIR="downloads"
GRAFANA_AGENT_VERSION="v0.24.1"
DOCKER_FILES_DIR="dockerfiles"
DOCKER_COMPOSE_DIR="docker-compose"
UNCONFIGURE_FILE="unconfigure.sh"


_escapeRegex() {
  echo $(printf '%s\n' "$1" | sed 's/[\[\.*^$/]/\\&/g' )
}

_modifyYml() {
  echo "_modifyYml [$1] [$2] [$3]"
  MOD_FILE=$1
  MOD_STR=$(_escapeRegex $2)
  NEW_VAL=$(_escapeRegex $3)
  #sed -i '.backup' "s/$MOD_STR/$NEW_VAL/g" $MOD_FILE
  sed -i '' "s/$MOD_STR/$NEW_VAL/g" $MOD_FILE
}

_getContainerIdFromName() {
  DOCKER_IMAGE_NAME=$1
  CONTAINER_ID=$(docker ps --format '{{json .}}' \
    | jq -r --arg DOCKER_IMAGE_NAME "$DOCKER_IMAGE_NAME" 'select(.Names | contains($DOCKER_IMAGE_NAME)) | .ID')
  echo $CONTAINER_ID
}

case "$CMD" in
  cloud-configure)
    # Configure Docker Compose config
    DST_CONFIG_FILE="docker-compose-cloud-configured.yml"
    SRC_CONFIG_FILE="docker-compose-cloud-unconfigured.yml"
    cat $SRC_CONFIG_FILE | envsubst > $DST_CONFIG_FILE
    echo "Created: $DST_CONFIG_FILE"
    echo "rm $DST_CONFIG_FILE" > $UNCONFIGURE_FILE
   
    # Configure Grafana Agent
    # GRAFANA_METRICS_*, GRAFANA_LOGS_*, GRAFANA_TRACES_*
    DST_CONFIG_FILE="agent/config-cloud-configured.yaml"
    SRC_CONFIG_FILE="agent/config-cloud-unconfigured.yaml"
    cat $SRC_CONFIG_FILE | envsubst > $DST_CONFIG_FILE
    echo "Created: $DST_CONFIG_FILE"
    echo "rm $DST_CONFIG_FILE" >> $UNCONFIGURE_FILE
  
    # Configure Prometheus
    # Not used for cloud
    #DST_CONFIG_FILE="prometheus/prometheus-cloud-configured.yml"
    #SRC_CONFIG_FILE="prometheus/prometheus-cloud-unconfigured.yml"
    #echo "Created: $DST_CONFIG_FILE"
    #echo "rm $DST_CONFIG_FILE" >> $UNCONFIGURE_FILE
  ;;
  run)
    docker run -i -t $CMD_ARG1 bash
  ;;
  cloud-up)
    docker-compose -f docker-compose-cloud-configured.yml up -d
  ;;
  cloud-down)
    docker-compose -f docker-compose-cloud-configured.yml down
  ;;
  logs)
    CONTAINER_ID=$(_getContainerIdFromName $2)
    docker logs $CONTAINER_ID
    ;;
  bash|sh)
    CONTAINER_ID=$(_getContainerIdFromName $2)
    echo "$1 to container: $2 id: ID"
    docker exec -it $CONTAINER_ID $1
  ;;
  test)
    echo "test"
    ;;
  *)
    echo "Command not recognized [$@]"
    echo "Help:"
    echo "  cloud-configure"
    echo "  cloud-up"
    echo "  cloud-down"
    echo "  sh | bash <container>"
    ;;
esac
