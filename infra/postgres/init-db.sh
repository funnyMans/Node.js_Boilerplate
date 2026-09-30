#!/bin/bash
set -e

createdb -U "${POSTGRES_USER:-dev}" -h localhost -p 5432 auth || true
createdb -U "${POSTGRES_USER:-dev}" -h localhost -p 5432 orders || true
createdb -U "${POSTGRES_USER:-dev}" -h localhost -p 5432 payments || true
createdb -U "${POSTGRES_USER:-dev}" -h localhost -p 5432 inventory || true
