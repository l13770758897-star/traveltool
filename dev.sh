#!/bin/bash
PORT=${PORT:-8080}
PID_FILE="/tmp/traveltool-server.pid"

case "${1:-start}" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "Server already running (PID $(cat "$PID_FILE"))"
      exit 1
    fi
    python3 -m http.server "$PORT" &
    echo $! > "$PID_FILE"
    echo "Server started on http://localhost:$PORT (PID $!)"
    ;;
  stop)
    if [ ! -f "$PID_FILE" ]; then
      echo "No server running"
      exit 1
    fi
    PID=$(cat "$PID_FILE")
    kill "$PID" 2>/dev/null && echo "Server stopped (PID $PID)" || echo "Server not running"
    rm -f "$PID_FILE"
    ;;
  restart)
    "$0" stop; "$0" start
    ;;
  status)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "Server running (PID $(cat "$PID_FILE")) on http://localhost:$PORT"
    else
      echo "Server not running"
      [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
