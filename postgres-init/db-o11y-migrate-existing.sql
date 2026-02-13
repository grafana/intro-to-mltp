-- Grafana Database Observability: one-off script for existing Postgres instances.
-- Use when the data volume already existed before adding the db-o11y init script.
--
-- 1. Replace <DB_O11Y_PASSWORD> below with the password for the db-o11y user.
-- 2. Run this file once per logical database (e.g. postgres, and any other DBs you use):
--    psql -h HOST -p PORT -U postgres -d postgres -f postgres-init/db-o11y-migrate-existing.sql
--    psql -h HOST -p PORT -U postgres -d OTHER_DB -f postgres-init/db-o11y-migrate-existing.sql
--
-- Extension: run in each database so pg_stat_statements is available there.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- User and privileges: cluster-wide; safe to run once (idempotent except password).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = "db-o11y") THEN
    CREATE USER "db-o11y" WITH PASSWORD "<DB_O11Y_PASSWORD>";
  END IF;
END
$$;
GRANT pg_monitor TO "db-o11y";
GRANT pg_read_all_stats TO "db-o11y";
ALTER ROLE "db-o11y" SET pg_stat_statements.track = 'none';
GRANT pg_read_all_data TO "db-o11y";
