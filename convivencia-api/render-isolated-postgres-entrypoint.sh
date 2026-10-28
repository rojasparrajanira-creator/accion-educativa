#!/bin/sh
set -eu
if [ -n "${DATABASE_URL:-}" ]; then
  echo "STAGING_ABORTED: no se admite DATABASE_URL de una base externa" >&2
  exit 1
fi
export PGDATA=/tmp/convivencia-pg-temporal
initdb -D "$PGDATA" -U postgres -A trust --no-instructions >/tmp/pg-init.log 2>&1
pg_ctl -D "$PGDATA" \
  -o "-c listen_addresses=127.0.0.1 -c port=5432 -c unix_socket_directories=/tmp -c shared_buffers=16MB -c max_connections=10 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" \
  -l /tmp/pg-staging.log -w start
cleanup(){ pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
export DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres
export NODE_OPTIONS=--max-old-space-size=192
node render-isolated-postgres.cjs
