#!/bin/bash

# Deployment script for one-way-availability-bot
# This script builds the Docker image, saves it as a tarball, transfers it to the server,
# and loads it into Docker on the remote server.

set -e  # Exit on error

# Configuration
IMAGE_NAME="one-way-availability-bot"
IMAGE_TAG="latest"
TARBALL_NAME="${IMAGE_NAME}.tar.gz"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if SERVER_IP is provided
if [ -z "$1" ]; then
    log_error "Usage: $0 <server-ipv6> [ssh-user]"
    log_info "Example: $0 2001:db8::1"
    log_info "Example (with user): $0 2001:db8::1 root"
    exit 1
fi

SERVER_IP="$1"
SSH_USER="${2:-root}"
REMOTE_DIR="/opt/bot"

# Detect IPv6 and format accordingly
# For scp with IPv6, we need [ipv6]:path format
# For ssh with IPv6, we can use ipv6 directly
# For curl with IPv6, we need http://[ipv6]:port format
if [[ "$SERVER_IP" == *:* ]]; then
    SCP_HOST="[${SERVER_IP}]"
    CURL_HOST="[${SERVER_IP}]"
else
    SCP_HOST="${SERVER_IP}"
    CURL_HOST="${SERVER_IP}"
fi

log_info "Deploying ${IMAGE_NAME}:${IMAGE_TAG} to ${SSH_USER}@${SERVER_IP}"

# Step 1: Build Docker image for target platform
log_info "Step 1/5: Building Docker image for linux/amd64..."
cd "$(dirname "$0")/.."  # Go to repository root
docker build --platform linux/amd64 -f one-way-availability-bot/Dockerfile -t "${IMAGE_NAME}:${IMAGE_TAG}" .

# Step 2: Save Docker image to tarball
log_info "Step 2/5: Saving Docker image to tarball..."
docker save "${IMAGE_NAME}:${IMAGE_TAG}" | gzip > "/tmp/${TARBALL_NAME}"
TARBALL_SIZE=$(du -h "/tmp/${TARBALL_NAME}" | cut -f1)
log_info "Tarball size: ${TARBALL_SIZE}"

# Step 3: Transfer tarball to server
log_info "Step 3/5: Transferring tarball to ${SERVER_IP}..."
scp "/tmp/${TARBALL_NAME}" "${SSH_USER}@${SCP_HOST}:${REMOTE_DIR}/${TARBALL_NAME}"

# Step 4: Load Docker image on server
log_info "Step 4/5: Loading Docker image on server..."
ssh "${SSH_USER}@${SERVER_IP}" "docker load < ${REMOTE_DIR}/${TARBALL_NAME}"

# Step 5: Restart container
log_info "Step 5/5: Restarting container..."
ssh "${SSH_USER}@${SERVER_IP}" "cd ${REMOTE_DIR} && docker compose up -d"

# Cleanup local tarball
rm "/tmp/${TARBALL_NAME}"

log_info "Deployment complete!"
log_info ""
log_info "Next steps:"
log_info "1. Check container status: ssh ${SSH_USER}@${SERVER_IP} 'cd ${REMOTE_DIR} && docker compose ps'"
log_info "2. View logs: ssh ${SSH_USER}@${SERVER_IP} 'cd ${REMOTE_DIR} && docker compose logs -f'"
log_info "3. Check health: ssh ${SSH_USER}@${SERVER_IP} 'curl -s http://127.0.0.1:3000/health'"
log_warn ""
log_warn "IMPORTANT: If this is the first deployment, make sure to:"
log_warn "1. Update BOT_TOKEN in ${REMOTE_DIR}/.env"
log_warn "2. Restart container: ssh ${SSH_USER}@${SERVER_IP} 'cd ${REMOTE_DIR} && docker compose restart'"
