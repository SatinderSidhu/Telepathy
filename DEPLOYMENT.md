# AWS Deployment Guide - ChatCall

## Phase 1: Testing with AWS Lightsail (~$10/month)

### Prerequisites
- AWS account
- Domain name (optional, can use Lightsail IP for testing)
- SSH key pair

---

## Step-by-Step Deployment

### 1. Create Lightsail Instance

1. Go to AWS Lightsail Console
2. Click **"Create instance"**
3. Select:
   - Platform: **Linux/Unix**
   - Blueprint: **OS Only** → **Ubuntu 22.04 LTS**
   - Instance plan: **$10/month (2 GB RAM, 1 vCPU, 60 GB SSD)**
4. Name: `chatcall-server`
5. Click **"Create instance"**

### 2. Configure Networking

**Open Required Ports:**

In Lightsail → Networking → Firewall:

| Application | Protocol | Port Range | Purpose |
|------------|----------|------------|---------|
| HTTPS | TCP | 443 | Frontend & Backend API |
| HTTP | TCP | 80 | Redirect to HTTPS |
| SSH | TCP | 22 | Server access |
| WebSocket | TCP | 3001 | Socket.io (if separate) |
| TURN/STUN | TCP | 3478 | TURN server |
| TURN/STUN | UDP | 3478 | TURN server |
| TURN relay | UDP | 49152-65535 | TURN relay ports |
| mediasoup | UDP | 40000-40100 | WebRTC media |

**Get Static IP:**
1. Lightsail → Networking → Create static IP
2. Attach to your instance
3. Note the IP address

---

### 3. Connect to Server

```bash
# Download SSH key from Lightsail
# Connect to server
ssh -i LightsailDefaultKey.pem ubuntu@YOUR_STATIC_IP
```

---

### 4. Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Node.js (for building frontend)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install nginx & certbot (for SSL)
sudo apt install -y nginx certbot python3-certbot-nginx

# Logout and login again for docker group to take effect
exit
```

---

### 5. Clone Repository

```bash
ssh -i LightsailDefaultKey.pem ubuntu@YOUR_STATIC_IP

# Clone your repo
git clone <your-repo-url> chatcall
cd chatcall
```

---

### 6. Configure Environment Variables

**Server Environment:**

```bash
cd server
cp .env.example .env
nano .env
```

Update with production values:

```env
# Server
PORT=3001
NODE_ENV=production

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=chatcall
DB_USER=chatcall_user
DB_PASSWORD=STRONG_PASSWORD_HERE

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT
JWT_SECRET=GENERATE_RANDOM_SECRET_HERE
JWT_REFRESH_SECRET=GENERATE_ANOTHER_SECRET_HERE
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# mediasoup
MEDIASOUP_ANNOUNCED_IP=YOUR_STATIC_IP_HERE

# TURN/STUN
TURN_SERVER_URL=turn:YOUR_STATIC_IP_HERE:3478
TURN_USERNAME=chatcall
TURN_PASSWORD=GENERATE_TURN_PASSWORD

# Client URL
CLIENT_URL=https://yourdomain.com

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

**Frontend Environment:**

```bash
cd ../web
cat > .env << EOF
VITE_API_URL=https://yourdomain.com/api
VITE_SOCKET_URL=https://yourdomain.com
EOF
```

---

### 7. Build Frontend

```bash
cd /home/ubuntu/chatcall/web
npm install
npm run build
```

---

### 8. Update Docker Compose for Production

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: chatcall
      POSTGRES_USER: chatcall_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  coturn:
    image: coturn/coturn:latest
    network_mode: host
    volumes:
      - ./coturn/turnserver.conf:/etc/coturn/turnserver.conf
    restart: unless-stopped

  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
    env_file:
      - ./server/.env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    volumes:
      - ./uploads:/app/uploads

volumes:
  postgres_data:
  redis_data:
```

---

### 9. Setup SSL Certificate

**If you have a domain:**

```bash
# Point your domain A record to your Lightsail static IP first

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com
```

**If using IP only (for testing):**

Use self-signed certificate (already created in ssl/ folder)

---

### 10. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/chatcall
```

```nginx
upstream backend {
    server localhost:3001;
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend - serve React build
    root /home/ubuntu/chatcall/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass https://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Socket.io WebSocket
    location /socket.io {
        proxy_pass https://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/chatcall /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

### 11. Start Services

```bash
cd /home/ubuntu/chatcall
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f
```

---

### 12. Run Database Migrations

```bash
cd server
npm install
npx knex migrate:latest --knexfile src/config/knexfile.js
```

---

## Testing Across Networks

1. **From your local network**: Access `https://yourdomain.com`
2. **From mobile (4G/5G)**: Test video calls
3. **From different locations**: Ask friends to test
4. **Check TURN server**: Use https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

---

## Monitoring & Maintenance

```bash
# Check running containers
docker ps

# View logs
docker-compose logs -f backend

# Restart services
docker-compose restart

# Update code
git pull
cd web && npm run build
docker-compose up -d --build
```

---

## Cost Optimization Tips

1. **Use Lightsail's free data transfer**: First 1-3 TB free
2. **Optimize images**: Use smaller Docker images
3. **Enable compression**: Nginx gzip compression
4. **Use CloudFlare CDN**: Free tier for static assets
5. **Monitor usage**: Set up billing alerts

---

## Scaling to Production

When ready to scale:

1. **Separate services**: Move DB to RDS, Redis to ElastiCache
2. **Add load balancer**: ALB for auto-scaling
3. **Use S3 + CloudFront**: For frontend static files
4. **Add auto-scaling**: EC2 Auto Scaling Groups
5. **Set up monitoring**: CloudWatch, logs, alerts

---

## Estimated Costs

### Testing (Lightsail)
- Lightsail 2GB: $10/month
- Domain (optional): $12/year
- **Total: ~$11/month**

### Production (EC2 + RDS)
- EC2 t3.medium: $30/month
- RDS PostgreSQL: $15/month
- ElastiCache: $12/month
- ALB: $20/month
- CloudFront: $5/month
- **Total: ~$82/month**

---

## Alternative: Even Cheaper Options

1. **DigitalOcean Droplet**: $6/month (1GB RAM)
2. **Hetzner Cloud**: €4.5/month (2GB RAM, better specs)
3. **Oracle Cloud Free Tier**: Free 2 AMD instances (limited)

---

## Next Steps

1. Set up Lightsail instance
2. Configure domain & SSL
3. Deploy with Docker Compose
4. Test video calls across networks
5. Monitor performance
6. Scale when needed
