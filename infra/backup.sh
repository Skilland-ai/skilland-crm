#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/twenty/backups"
COMPOSE_DIR="/opt/twenty"
RETAIN_DAYS=30

mkdir -p "$BACKUP_DIR"
FILENAME="twenty-$(date +%Y-%m-%d).dump"

cd "$COMPOSE_DIR"
source .env

docker compose exec -T db pg_dump -U postgres -Fc default > "$BACKUP_DIR/$FILENAME"

find "$BACKUP_DIR" -name "twenty-*.dump" -mtime +$RETAIN_DAYS -delete

logger -t twenty-backup "Backup completed: $FILENAME ($(du -h "$BACKUP_DIR/$FILENAME" | cut -f1))"
