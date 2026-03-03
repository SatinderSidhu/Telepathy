#!/bin/bash

# ChatCall - Lightsail Instance Initialization Script
# This runs when the instance first boots

set -e

echo "🚀 Starting ChatCall server initialization..."

# Update system
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker ubuntu
rm get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Nginx & Certbot
apt-get install -y nginx certbot python3-certbot-nginx

# Install Git
apt-get install -y git

# Create directory for ChatCall
mkdir -p /home/ubuntu/chatcall
chown ubuntu:ubuntu /home/ubuntu/chatcall

# Configure automatic security updates
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# Enable firewall (managed by Lightsail console, but good to have ufw as backup)
ufw --force enable
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3478/tcp  # TURN TCP
ufw allow 3478/udp  # TURN UDP
ufw allow 40000:40100/udp  # mediasoup
ufw allow 49152:65535/udp  # TURN relay

# Set timezone to UTC
timedatectl set-timezone UTC

# Increase file descriptor limits for mediasoup
cat >> /etc/security/limits.conf << 'EOF'
* soft nofile 65536
* hard nofile 65536
EOF

# Optimize kernel for WebRTC
cat >> /etc/sysctl.conf << 'EOF'
net.core.rmem_max=26214400
net.core.rmem_default=26214400
net.core.wmem_max=26214400
net.core.wmem_default=26214400
EOF
sysctl -p

# Create swap file (helps with low memory)
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Create ready indicator
touch /var/lib/cloud/instance/chatcall-ready

echo "✅ ChatCall server initialization complete!"
echo "📝 Log in and follow LIGHTSAIL_QUICKSTART.md to deploy the application"
