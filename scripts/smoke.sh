#!/bin/sh
set -eu
curl -fsS "${BASE_URL:-http://localhost:3000}/api/health"
echo
curl -fsS "${BASE_URL:-http://localhost:3000}/api/readiness"
echo
