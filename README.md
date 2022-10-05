[![Release](https://github.com/SkynetLabs/webportal-health-check/actions/workflows/ci_release.yml/badge.svg)](https://github.com/SkynetLabs/webportal-health-check/actions/workflows/ci_release.yml)
[![CodeQL](https://github.com/SkynetLabs/webportal-health-check/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/SkynetLabs/webportal-health-check/actions/workflows/codeql-analysis.yml)

# Webportal Health Check

This repo contains the health checks that are run on the Skynet Webportals

## Services composition

### HTTP API server

This service includes a standalone HTTP server that exposes health check API endpoints.

> executing `node src` runs the server

By default the server runs on 0.0.0.0 port 3100 but you can configure those settings with environment variables `HOSTNAME` and `PORT`.

#### API endpoints

- `/health-check` returns current health check status (shows only failed checks if any), response code will be 200 when status is up and 503 otherwise
- `/health-check/critical` returns critical checks (last 24 hours)
- `/health-check/extended` returns extended checks (last 24 hours)
- `/health-check/disabled` returns information whether server is set to disabled

### Checks

There are 2 types of checks in this service:

- [critical](src/checks/critical.js): quick and cheap to run, failure of those checks should result in server being marked as failing (disabled)
- [extended](src/checks/extended.js): set of popular or common skylinks that should be checked against less frequently to ensure server is in good condition

### CLI

This service includes a [cli](bin/cli) binary that is accessible from `bin` directory and exposes some of the service' functionalities.

- `bin/cli` displays available commands
- `bin/cli run [critical|extended]` executes health checks of given type
- `bin/cli enable` toggles the health check `disabled` flag to `false`
- `bin/cli disable <reason>` toggles the health check `disabled` flag on with a given reason (ie. "down for maintenance")

There are also cli scripts in `cli` directory but those should be considered deprecated and are kept only for backwards compatibility.

## Docker image

Image of this service is available on [dockerhub](https://hub.docker.com/repository/docker/skynetlabs/webportal-health-check) and is built from Dockerfile file found in root directory of this repository.

Docker image includes running HTTP API server in foreground and crontab configuration for running critical checks every 5 minutes and extended checks every 60 minutes. It also exposes `cli` binary directly on the container so you can use it like `docker exec health-check cli enable`.
