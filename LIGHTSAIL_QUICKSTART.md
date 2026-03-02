# AWS Lightsail Quick Start - ChatCall

**Cost: ~$10-15/month** | **Setup Time: ~30 minutes**

---

## Prerequisites

- ✅ AWS Account
- ✅ Domain name (optional but recommended)
- ✅ Gmail account (for SMTP)

---

## Step 1: Create Lightsail Instance (5 min)

### 1.1 Go to AWS Lightsail
- Visit: https://lightsail.aws.amazon.com/
- Click **"Create instance"**

### 1.2 Configure Instance
- **Region**: Choose closest to your users (e.g., us-east-1)
- **Platform**: Linux/Unix
- **Blueprint**: **OS Only** → **Ubuntu 22.04 LTS**
- **Instance Plan**: **$10/month** (2 GB RAM, 1 vCPU, 60 GB SSD)
  - Good for 10-50 concurrent users
  - Upgrade to $20/month for more users
- **Instance Name**: `chatcall-server`
- Click **"Create instance"**

### 1.3 Wait for Instance to Start
- Status should show "Running" (takes ~2 minutes)

---

## Step 2: Configure Networking (3 min)

### 2.1 Create Static IP
1. Lightsail → **Networking** → **Create static IP**
2. Attach to `chatcall-server`
3. Name: `chatcall-static-ip`
4. **Note down the IP address** (e.g., 18.xxx.xxx.xxx)

### 2.2 Configure Firewall
Lightsail → `chatcall-server` → **Networking** → **Firewall**

Add these rules:

| Application | Protocol | Port | Range |
|------------|----------|------|--------|
| HTTPS | TCP | 443 | ✅ |
| HTTP | TCP | 80 | ✅ (redirect to HTTPS) |
| Custom | TCP | 3478 | ✅ (TURN) |
| Custom | UDP | 3478 | ✅ (TURN) |
| Custom | UDP | 40000-40100 | ✅ (mediasoup) |
| Custom | UDP | 49152-65535 | ✅ (TURN relay) |

---

## Step 3: Configure Domain (Optional, 5 min)

If you have a domain (e.g., chatcall.yourdomain.com):

### Option A: Using Route 53
1. Route 53 → **Hosted Zones** → Select your domain
2. **Create Record**:
   - Record name: `chatcall` (or leave blank for root)
   - Record type: **A**
   - Value: Your Lightsail static IP
   - TTL: 300
3. Save

### Option B: Using Your Domain Registrar
1. Go to your domain registrar (GoDaddy, Namecheap, etc.)
2. Add **A Record**:
   - Host: `chatcall` (or `@` for root)
   - Points to: Your Lightsail static IP
   - TTL: 300 (or default)

**Wait 5-10 minutes for DNS propagation**

---

## Step 4: Connect to Server (2 min)

### 4.1 Download SSH Key
1. Lightsail → **Account** → **SSH keys**
2. Download default key for your region
3. Save as `LightsailDefaultKey.pem`

### 4.2 Connect
```bash
# Set proper permissions
chmod 400 LightsailDefaultKey.pem

# Connect to server
ssh -i LightsailDefaultKey.pem ubuntu@YOUR_STATIC_IP
```

---

## Step 5: Install Dependencies (5 min)

Run these commands on the server:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Node.js (for building frontend)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx & Certbot (for SSL)
sudo apt install -y nginx certbot python3-certbot-nginx git

# Logout and login again
exit
```

**Reconnect:**
```bash
ssh -i LightsailDefaultKey.pem ubuntu@YOUR_STATIC_IP
```

---

## Step 6: Clone & Configure (5 min)

### 6.1 Clone Repository
```bash
# Option 1: From GitHub (if you pushed your code)
git clone https://github.com/yourusername/chatcall.git
cd chatcall

# Option 2: Transfer files from local machine
# (On your local machine)
scp -i LightsailDefaultKey.pem -r /path/to/project ubuntu@YOUR_STATIC_IP:~/chatcall
```

### 6.2 Configure Production Environment
```bash
cd ~/chatcall/server
cp .env.production.example .env.production
nano .env.production
```

**Update these values:**
```env
DB_PASSWORD=MyStrongDBPassword123!
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
MEDIASOUP_ANNOUNCED_IP=YOUR_LIGHTSAIL_STATIC_IP
TURN_SERVER_URL=turn:YOUR_LIGHTSAIL_STATIC_IP:3478
TURN_PASSWORD=MyStrongTurnPassword456!
CLIENT_URL=https://yourdomain.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=your-email@gmail.com
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

### 6.3 Configure Frontend
```bash
cd ~/chatcall/web
cat > .env << EOF
VITE_API_URL=https://yourdomain.com/api
VITE_SOCKET_URL=https://yourdomain.com
EOF
```

---

## Step 7: Get SSL Certificate (3 min)

### If you have a domain:
```bash
sudo certbot --nginx -d yourdomain.com

# Follow prompts:
# - Enter email
# - Agree to terms (Y)
# - Share email? (N)
```

### If testing with IP only:
```bash
# Use self-signed certificate (already in ssl/ folder)
# OR generate new one:
cd ~/chatcall
mkdir -p ssl
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes \
  -subj "/CN=YOUR_STATIC_IP" \
  -addext "subjectAltName=IP:YOUR_STATIC_IP"
```

---

## Step 8: Configure Nginx (3 min)

### 8.1 Copy Nginx Configuration
```bash
sudo cp ~/chatcall/nginx/chatcall.conf /etc/nginx/sites-available/chatcall
```

### 8.2 Update Configuration
```bash
sudo nano /etc/nginx/sites-available/chatcall
```

**Replace:**
- `yourdomain.com` → Your actual domain
- SSL certificate paths (if not using Let's Encrypt default paths)

### 8.3 Enable Site
```bash
# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Enable ChatCall site
sudo ln -s /etc/nginx/sites-available/chatcall /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## Step 9: Deploy Application (5 min)

### 9.1 Make deploy script executable
```bash
cd ~/chatcall
chmod +x deploy.sh
```

### 9.2 Run Deployment
```bash
./deploy.sh
```

**This will:**
- Build frontend
- Start Docker containers (Postgres, Redis, TURN, Backend)
- Run database migrations
- Show container status

### 9.3 Verify Deployment
```bash
# Check containers
docker ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f backend

# Test health endpoint
curl http://localhost:3001/api/health
```

---

## Step 10: Test Your Application! 🎉

### Access Your App:
- **With domain**: https://yourdomain.com
- **With IP** (for testing): https://YOUR_STATIC_IP (accept self-signed cert warning)

### Test Features:
1. ✅ **Register** a new account
2. ✅ **Login**
3. ✅ **Send messages** (test with 2 browser windows)
4. ✅ **Start video call**
5. ✅ **Test from mobile** (4G/5G network)
6. ✅ **Test forgot password** (check email)
7. ✅ **Desktop notifications**

---

## Troubleshooting

### Container won't start:
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs backend

# Restart services
docker-compose -f docker-compose.prod.yml restart
```

### Can't access website:
```bash
# Check Nginx status
sudo systemctl status nginx

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Test Nginx config
sudo nginx -t
```

### Video calls not working:
```bash
# Check mediasoup announced IP
grep MEDIASOUP_ANNOUNCED_IP ~/chatcall/server/.env.production

# Should be your public IP, not localhost!

# Check TURN server
sudo docker logs chatcall-coturn

# Test TURN with: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
```

### Database migration failed:
```bash
# Run migrations manually
docker-compose -f docker-compose.prod.yml exec backend sh -c "cd /app && npx knex migrate:latest --knexfile src/config/knexfile.js"
```

---

## Maintenance

### View Logs:
```bash
docker-compose -f docker-compose.prod.yml logs -f
```

### Restart Services:
```bash
docker-compose -f docker-compose.prod.yml restart
```

### Update Code:
```bash
cd ~/chatcall
git pull
./deploy.sh
```

### Backup Database:
```bash
docker exec chatcall-postgres pg_dump -U chatcall_user chatcall > backup_$(date +%Y%m%d).sql
```

### Monitor Resources:
```bash
# CPU/Memory usage
docker stats

# Disk usage
df -h
```

---

## Cost Optimization

1. **Enable Lightsail data transfer allowance** (First 1-3TB free)
2. **Use CloudFlare CDN** (Free tier for static assets)
3. **Set up billing alerts** in AWS
4. **Monitor usage** with `docker stats`

---

## Scaling Tips

When you outgrow Lightsail:
1. **Upgrade Lightsail plan** ($20/month for 4GB)
2. **Migrate to EC2** with RDS + ElastiCache
3. **Add load balancer** for auto-scaling
4. **Use S3 + CloudFront** for static files

---

## Next Steps

✅ Deploy on Lightsail
✅ Test across different networks
✅ Share with friends for testing
✅ Monitor performance
📈 Scale when needed!

---

## Need Help?

- Check logs: `docker-compose logs -f`
- Test health: `curl http://localhost:3001/api/health`
- Nginx logs: `sudo tail -f /var/log/nginx/error.log`

**Total Cost: ~$10.50/month** 💰
