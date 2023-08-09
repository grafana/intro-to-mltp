FROM alpine:3.18.2

RUN apk update && \
    apk --no-cache add curl

COPY grafana-writer.sh /grafana-writer.sh

CMD ["/bin/sh", "-c", "/grafana-writer.sh"]
