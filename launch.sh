#!/usr/bin/env sh
#Cross-platform (macOS / Linux) launcher.
# On Windows use launch.vbs or start_server.bat.
cd "$(dirname "$0")" 
exec node server.js