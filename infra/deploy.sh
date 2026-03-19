#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Get instance IP from OpenTofu
INSTANCE_IP=$(tofu output -raw instance_ip 2>/dev/null || terraform output -raw instance_ip 2>/dev/null)
SSH_USER=ubuntu
SSH_KEY="${SSH_KEY:-$SCRIPT_DIR/twenty-crm.pem}"
REMOTE_DIR=/opt/twenty

echo "==> Target: $SSH_USER@$INSTANCE_IP"

# Generate .env if it doesn't exist
if [ ! -f .env ]; then
  echo "==> Generating .env with secrets..."
  cp .env.example .env
  {
    echo ""
    echo "APP_SECRET=$(openssl rand -base64 32)"
    echo "PG_DATABASE_PASSWORD=$(openssl rand -hex 16)"
  } >> .env
  echo "    .env created — review it before continuing."
  echo "    Press Enter to continue or Ctrl+C to abort."
  read -r
fi

echo "==> Uploading files..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$INSTANCE_IP" "mkdir -p /tmp/twenty-deploy"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
  docker-compose.yml Caddyfile .env backup.sh \
  "$SSH_USER@$INSTANCE_IP:/tmp/twenty-deploy/"

echo "==> Deploying on remote..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$INSTANCE_IP" bash -s << 'REMOTE'
set -euo pipefail

sudo mkdir -p /opt/twenty /opt/twenty/backups
sudo cp /tmp/twenty-deploy/.env /tmp/twenty-deploy/* /opt/twenty/
sudo chown ubuntu:ubuntu /opt/twenty/*
sudo chmod +x /opt/twenty/backup.sh
cd /opt/twenty

echo "==> Installing backup cron job..."
{ crontab -l 2>/dev/null || true; } | grep -v '/opt/twenty/backup.sh' | { cat; echo '0 2 * * * /opt/twenty/backup.sh'; } | crontab -

echo "==> Pulling images..."
docker compose pull

echo "==> Starting services..."
docker compose up -d

echo "==> Waiting for server to be healthy..."
for i in $(seq 1 60); do
  if docker compose exec -T server curl -sf http://localhost:3000/healthz > /dev/null 2>&1; then
    echo "==> Server is healthy!"
    exit 0
  fi
  sleep 5
done
echo "==> Warning: server did not become healthy within 5 minutes. Check logs with: docker compose logs server"
REMOTE

DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)
echo ""
echo "==> Deployment complete!"
echo "    URL: https://$DOMAIN"
echo "    API: https://$DOMAIN/graphql"
echo "    SSH: ssh -i $SSH_KEY $SSH_USER@$INSTANCE_IP"
