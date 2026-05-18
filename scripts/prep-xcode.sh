#!/usr/bin/env bash
# Start Metro hvis port 8081 er fri, så Xcode kan genindlæse JS med Cmd+R.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if lsof -iTCP:8081 -sTCP:LISTEN -P -n >/dev/null 2>&1; then
  echo "Metro kører allerede på port 8081."
else
  echo "Starter Metro (expo start) i baggrunden …"
  nohup npx expo start --clear >> /tmp/parkly-metro.log 2>&1 &
  echo "Venter på Metro …"
  for i in $(seq 1 40); do
    if lsof -iTCP:8081 -sTCP:LISTEN -P -n >/dev/null 2>&1; then
      echo "Metro er klar."
      break
    fi
    sleep 0.5
  done
fi

open "$ROOT/ios/Parkly.xcworkspace"
echo ""
echo "Xcode er åbnet. Kør appen (▶) og brug Cmd+R for at genindlæse efter kodeændringer."
echo "Metro-log: tail -f /tmp/parkly-metro.log"
