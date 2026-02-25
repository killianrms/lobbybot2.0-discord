#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"

case "$1" in
  start)
    echo ">>> Starting all containers..."
    docker compose -f "$DIR/docker-compose.yml" up -d
    ;;
  stop)
    echo ">>> Stopping all containers..."
    docker compose -f "$DIR/docker-compose.yml" stop
    ;;
  restart)
    echo ">>> Restarting all containers..."
    docker compose -f "$DIR/docker-compose.yml" restart
    ;;
  down)
    echo ">>> Bringing down all containers (removes them)..."
    docker compose -f "$DIR/docker-compose.yml" down
    ;;
  logs)
    SERVICE="${2:-}"
    docker compose -f "$DIR/docker-compose.yml" logs -f $SERVICE
    ;;
  status)
    docker compose -f "$DIR/docker-compose.yml" ps
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|down|logs [service]|status}"
    echo ""
    echo "  start           Start all containers (detached)"
    echo "  stop            Stop all containers (keep them)"
    echo "  restart         Restart all containers"
    echo "  down            Stop and remove all containers"
    echo "  logs [service]  Follow logs (all or specific service)"
    echo "  status          Show container status"
    exit 1
    ;;
esac
