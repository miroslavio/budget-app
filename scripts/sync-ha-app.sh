#!/usr/bin/env sh
set -e

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/ha-app/household_budget/app"

mkdir -p "$TARGET_DIR"
find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

tar \
  --exclude='./.git' \
  --exclude='./.agents' \
  --exclude='./.codex' \
  --exclude='./node_modules' \
  --exclude='./data' \
  --exclude='./docs' \
  --exclude='./ha-app' \
  --exclude='./scripts' \
  --exclude='./src/tests' \
  --exclude='./coverage' \
  --exclude='./.env' \
  --exclude='./*.sqlite' \
  --exclude='./*.sqlite-*' \
  -cf - \
  -C "$ROOT_DIR" . | tar -xf - -C "$TARGET_DIR"
