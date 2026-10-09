#!/bin/bash
set -euo pipefail

postgres_user="${POSTGRES_USER:-dev}"
default_database="${POSTGRES_DB:-app}"
databases="${POSTGRES_MULTIPLE_DATABASES:-users,auth}"

IFS=',' read -r -a database_names <<< "$databases"
for database in "${database_names[@]}"; do
  if [[ ! "$database" =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]]; then
    printf 'Invalid database name in POSTGRES_MULTIPLE_DATABASES: %s\n' "$database" >&2
    exit 1
  fi

  if [[ "$database" == "$default_database" ]]; then
    continue
  fi

  createdb -U "$postgres_user" "$database"
done
