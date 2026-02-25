#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="docker compose -f $DIR/docker-compose.yml --env-file $DIR/.env"

# Warn if .env is missing
if [ ! -f "$DIR/.env" ]; then
  echo "⚠️  WARNING: $DIR/.env not found! Copy .env.example and fill in the values."
  echo "   cp $DIR/.env.example $DIR/.env"
  if [ "$1" != "help" ] && [ "$1" != "" ]; then
    exit 1
  fi
fi

case "$1" in
  start)
    echo ">>> Starting all containers..."
    $COMPOSE up -d
    ;;
  stop)
    echo ">>> Stopping all containers..."
    $COMPOSE stop
    ;;
  restart)
    echo ">>> Restarting all containers (applying current config)..."
    $COMPOSE up -d --force-recreate
    ;;
  rebuild)
    echo ">>> Rebuilding and restarting all containers..."
    $COMPOSE up -d --build --force-recreate
    ;;
  down)
    echo ">>> Bringing down all containers (removes them)..."
    $COMPOSE down
    ;;
  logs)
    SERVICE="${2:-}"
    $COMPOSE logs -f $SERVICE
    ;;
  status)
    $COMPOSE ps
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|rebuild|down|logs [service]|status}"
    echo ""
    echo "  start              Start all containers (detached)"
    echo "  stop               Stop all containers (keep them)"
    echo "  restart            Restart all containers (apply config changes)"
    echo "  rebuild            Rebuild images + restart (use after code changes)"
    echo "  down               Stop and remove all containers"
    echo "  logs [service]     Follow logs (all or specific service)"
    echo "  status             Show container status"
    exit 1
    ;;
esac
