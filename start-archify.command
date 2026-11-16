#!/usr/bin/env bash
# Double-click / run to open the Archify UI in your browser.
cd "$(dirname "$0")/archify" && exec node gui/server.mjs "$@"
