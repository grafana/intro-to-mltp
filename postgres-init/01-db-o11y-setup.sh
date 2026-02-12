#!/bin/bash
# Grafana Database Observability: create pg_stat_statements extension, db-o11y user, and grants.
# Runs once when the Postgres data directory is first created (docker-entrypoint-initdb.d).
set -e

# Extension in template1 so any new database gets it; and in postgres (default DB).
psql -v ON_ERROR_STOP=1 --dbname=template1 -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
psql -v ON_ERROR_STOP=1 --dbname=postgres -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"

# Create monitoring user and privileges (password from DB_O11Y_PASSWORD env).
psql -v ON_ERROR_STOP=1 --dbname=postgres -v pwd="${DB_O11Y_PASSWORD:?DB_O11Y_PASSWORD must be set}" <<'EOSQL'
CREATE USER "db-o11y" WITH PASSWORD :'pwd';
GRANT pg_monitor TO "db-o11y";
GRANT pg_read_all_stats TO "db-o11y";
ALTER ROLE "db-o11y" SET pg_stat_statements.track = 'none';
GRANT pg_read_all_data TO "db-o11y";
EOSQL
