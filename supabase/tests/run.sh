#!/usr/bin/env bash
# Runs migrations + RLS tests on a throwaway local Postgres (no Docker needed).
set -euo pipefail
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=()
if [ "$(id -u)" = 0 ]; then chown -R postgres "$TMP"; RUN_AS=(runuser -u postgres --); fi
"${RUN_AS[@]}" "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c wal_level=logical" -l "$TMP/log" -w start >/dev/null
trap '"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -m fast stop >/dev/null; rm -rf "$TMP"' EXIT
PSQL=("$PGBIN/psql" -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$DIR/supabase_stub.sql"
for f in "$DIR"/../migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$DIR/rls_test.sql"
