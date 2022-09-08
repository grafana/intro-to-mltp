FROM prom/prometheus:v2.37.0

WORKDIR /usr/src/app
COPY prometheus.yml /etc/prometheus/
CMD [   "--config.file=/etc/prometheus/prometheus.yml", \
        "--storage.tsdb.path=/prometheus", \
        "--web.console.libraries=/usr/share/prometheus/console_libraries",\
        "--web.console.templates=/usr/share/prometheus/consoles", \
        "--enable-feature=exemplar-storage" \
    ]
