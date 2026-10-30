#!/usr/bin/env bash
# Apply the migrations to a throwaway Postgres and run the data model checks.
# Needs the PostgreSQL server binaries (for example `apt install postgresql`). Touches nothing outside a temp folder.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -x "$bin/initdb" ] || { echo "PostgreSQL server binaries not found"; exit 2; }

dir="$(mktemp -d)"
port=54329
# initdb refuses to run as root, so run the throwaway cluster as the postgres user when we are root
run() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
chmod 755 "$dir"; [ "$(id -u)" = 0 ] && chown postgres "$dir"

cleanup() { run "$bin/pg_ctl" -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT

run "$bin/initdb" -D "$dir/data" -A trust -U postgres >/dev/null
run "$bin/pg_ctl" -D "$dir/data" -o "-p $port -k $dir -c listen_addresses=''" -w start >/dev/null

psql_run() { run psql -h "$dir" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_run -d postgres -c 'create database test' >/dev/null
psql_run -d test -f "$here/mock_supabase.sql"
for f in "$here"/../migrations/*.sql; do psql_run -d test -f "$f"; done
# every *.test.sql file, in order, against the same database
for t in "$here"/*.test.sql; do
  psql_run -d test -f "$t" 2>&1 | grep -E "^(psql:|NOTICE:|ALL |ERROR)|ok  |FAIL" | sed 's/^psql:[^ ]* //; s/^NOTICE:  //'
done
