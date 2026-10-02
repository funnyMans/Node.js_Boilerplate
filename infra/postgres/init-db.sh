#!/bin/bash
set -e

createdb -U "${POSTGRES_USER:-dev}" auth
createdb -U "${POSTGRES_USER:-dev}" orders
createdb -U "${POSTGRES_USER:-dev}" payments
createdb -U "${POSTGRES_USER:-dev}" inventory
