# One-Way Availability Bot - Deployment Infrastructure

This directory contains all the infrastructure and deployment configuration for the One-Way Availability Bot on Hetzner Cloud.

## Files Overview

- `cloud-config.yaml` - Hetzner Cloud-Init configuration for automated server setup
- `deploy.sh` - Automated deployment script
- `README.md` - This file

## Prerequisites

- Docker installed locally
- Hetzner Cloud account
- SSH access to your Hetzner server

## Production Deployment on Hetzner Cloud

### Step 1: Create Hetzner Server

Create a new Hetzner Cloud server with the **Docker CE** app image. Before pasting `cloud-config.yaml` in the "Cloud config" field, adjust these IPv6 values to match your server:
- Line 16: `"fixed-cidr-v6": "2a01:4f9:c013:4e8d::/80"` - replace with your server's /64 subnet (use /80)
- Line 77: `subnet: 2a01:4f9:c013:4e8d:1::/80` - same subnet but with `:1::` to separate Docker Compose network

### Step 2: Deploy with Script

```bash
# From infra directory
./deploy.sh <server-ipv6-address> [ssh-user]

# Example:
./deploy.sh 2001:db8::1 root
```

The script will:
1. Build the Docker image locally
2. Save it as a compressed tarball
3. Transfer it to the server via SCP
4. Load the image on the server
5. Start the container with docker compose

### Step 3: Configure Bot Token

```bash
# SSH to server
ssh root@<server-ip>

# Edit .env file
nano /opt/bot/.env

# Replace BOT_TOKEN value with your actual token
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# Save and exit (Ctrl+X, Y, Enter)

# Restart container
cd /opt/bot
docker compose restart
```

### Step 4: Verify Deployment

```bash
# Check container status
ssh root@<server-ip> "cd /opt/bot && docker compose ps"

# View logs
ssh root@<server-ip> "cd /opt/bot && docker compose logs -f"

# Check health (firewall blocks external access to port 3000)
ssh root@<server-ip> "curl -s http://127.0.0.1:3000/health"

# Should return:
# {"status":"ok","timestamp":"...","checks":{"database":"ok","botApi":"ok"}}
```

## Updating the Bot

When you make code changes and want to deploy updates:

```bash
# From infra directory
./deploy.sh <server-ip>
```

The script handles everything automatically:
- Rebuilds the image with latest code
- Transfers to server
- Loads new image
- Restarts container (graceful shutdown with 30s timeout)

## Monitoring

### Health Check

Port 3000 is blocked by the firewall. Check health from the server:

```bash
ssh root@<server-ip> "curl -s http://127.0.0.1:3000/health"
```

Returns:
- `200 OK` - Everything is healthy
- `503 Service Unavailable` - Database or bot API issues

### Metrics (Prometheus Format)

Port 3000 is blocked by the firewall. Check metrics from the server:

```bash
ssh root@<server-ip> "curl -s http://127.0.0.1:3000/metrics"
```

Key metrics:
- `bot_commands_total` - Total commands processed
- `bot_errors_total` - Total errors by type
- `bot_entries_active` - Current number of active entries
- `bot_database_operations_total` - Database operation counts
- `bot_command_duration_seconds` - Command processing time histogram

### Logs

```bash
# View real-time logs
ssh root@<server-ip> "cd /opt/bot && docker compose logs -f"

# View last 100 lines
ssh root@<server-ip> "cd /opt/bot && docker compose logs --tail=100"

# View logs for specific time range
ssh root@<server-ip> "cd /opt/bot && docker compose logs --since 1h"
```

## Backup & Recovery

### Backup Database

The SQLite database is stored at `/opt/bot/data/availability.db` on the server.

```bash
# Create backup
ssh root@<server-ip> "cp /opt/bot/data/availability.db /opt/bot/data/availability.db.backup-$(date +%Y%m%d)"

# Download backup to local machine
scp root@<server-ip>:/opt/bot/data/availability.db ./bot-backup-$(date +%Y%m%d).db
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
ssh root@<server-ip> "cd /opt/bot && docker compose logs"

# Check if image exists
ssh root@<server-ip> "docker images | grep one-way-availability-bot"

# Verify .env file
ssh root@<server-ip> "cat /opt/bot/.env"
```

### Bot Not Responding

```bash
# Check health endpoint
ssh root@<server-ip> "curl -s http://127.0.0.1:3000/health"

# Check container status
ssh root@<server-ip> "cd /opt/bot && docker compose ps"

# View recent logs
ssh root@<server-ip> "cd /opt/bot && docker compose logs --tail=50"

# Restart container
ssh root@<server-ip> "cd /opt/bot && docker compose restart"
```

### Database Issues

```bash
# Check database file
ssh root@<server-ip> "ls -lh /opt/bot/data/availability.db"

# Check database integrity (from inside container)
ssh root@<server-ip> "cd /opt/bot && docker compose exec one-way-availability-bot sh -c 'sqlite3 /app/data/availability.db \"PRAGMA integrity_check;\"'"
```

### Out of Disk Space

```bash
# Check disk usage
ssh root@<server-ip> "df -h"

# Clean up Docker
ssh root@<server-ip> "docker system prune -a"

# Remove old images
ssh root@<server-ip> "docker images | grep none | awk '{print \$3}' | xargs docker rmi"
```

## Architecture

```
┌─────────────────────────────────────────┐
│         Hetzner Cloud Server            │
│         (Docker CE App)                 │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Docker Container                 │ │
│  │  (one-way-availability-bot)       │ │
│  │                                   │ │
│  │  ├─ Node.js Runtime               │ │
│  │  ├─ Telegram Bot (GramIO)         │ │
│  │  ├─ SQLite Database               │ │
│  │  ├─ Metrics Server (Fastify)      │ │
│  │  └─ Expiry Scheduler              │ │
│  │                                   │ │
│  │  Volumes:                         │ │
│  │  - /app/data → /opt/bot/data      │ │
│  │                                   │ │
│  │  Ports:                           │ │
│  │  - 3000 (metrics + health)        │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
           │
           │ Telegram Bot API
           ↓
     Telegram Servers
```
