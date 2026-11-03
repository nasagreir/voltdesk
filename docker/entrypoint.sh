#!/bin/sh
# Persist a signing secret in the data volume when the operator did not set one.
# Docker injects HOSTNAME as the container name; Next.js would bind only to that
# name, so the listen address is set here before the server starts.
set -eu

data_dir="${VOLTDESK_DATA_DIR:-/data}"
mkdir -p "$data_dir"

secret="${AUTH_SECRET:-}"
if [ -z "$secret" ]; then
  secret="${VOLTDESK_AUTH_SECRET:-}"
fi

placeholder="change-me-to-a-long-random-string"
if [ -z "$secret" ] || [ "$secret" = "$placeholder" ] || [ "${#secret}" -lt 16 ]; then
  secret_file="${data_dir}/auth-secret"
  if [ ! -s "$secret_file" ]; then
    umask 077
    node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))' > "$secret_file"
    chmod 600 "$secret_file" 2>/dev/null || true
  fi
  AUTH_SECRET=$(cat "$secret_file")
  export AUTH_SECRET
fi

export HOSTNAME=0.0.0.0
export PORT="${PORT:-3470}"

cd /app
exec node server.js
