#!/usr/bin/env sh
set -e

mkdir -p /data

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
export DATABASE_PATH="${DATABASE_PATH:-/data/budget.sqlite}"

if [ -f /data/options.json ]; then
  CONFIGURED_DATABASE_PATH="$(node -e "try { const fs = require('node:fs'); const options = JSON.parse(fs.readFileSync('/data/options.json', 'utf8')); if (options.database_path) process.stdout.write(options.database_path); } catch {}")"
  if [ -n "$CONFIGURED_DATABASE_PATH" ]; then
    export DATABASE_PATH="$CONFIGURED_DATABASE_PATH"
  fi
fi

cd /app
npm start
