# ChatCall - Setup & Run Guide

## Prerequisites

| Requirement | Minimum Version |
|-------------|----------------|
| Node.js | v18+ |
| npm | v9+ |
| Docker & Docker Compose | Latest |
| Git | Any |

## 1. Clone & Install

```bash
cd /Users/satindersidhu/Documents/development/uTubeVideos/project-1

# Install server dependencies
cd server && npm install

# Install web dependencies
cd ../web && npm install
```

## 2. Start Databases

```bash
# From project root
docker-compose up -d postgres redis
```

Verify they're running:
```bash
docker-compose ps
```

Expected output:
```
NAME                    STATUS
project-1-postgres-1    Up
project-1-redis-1       Up
```

**Note**: Redis is mapped to port **6380** (not 6379) because the local machine already has Redis running on 6379.

## 3. Run Database Migrations

```bash
cd server
npm run migrate
```

This creates all 6 tables: `users`, `contacts`, `conversations`, `conversation_members`, `messages`, `call_logs`.

To rollback migrations:
```bash
npm run migrate:rollback
```

## 4. Configure Environment

### Server (`server/.env`)

The `.env` file is already created. Update these values for your environment:

```env
# Update MEDIASOUP_ANNOUNCED_IP to your machine's LAN IP
MEDIASOUP_ANNOUNCED_IP=192.168.68.73

# Update TURN credentials if changing coturn config
TURN_SERVER_URL=turn:192.168.68.73:3478
TURN_USERNAME=chatcall
TURN_PASSWORD=chatcall_turn_secret

# IMPORTANT: Change these secrets for production
JWT_SECRET=change_this_to_a_random_secret_in_production
JWT_REFRESH_SECRET=change_this_to_another_random_secret
```

### Web (`web/.env`)

Update to match your server IP:

```env
VITE_API_URL=http://192.168.68.73:3001/api
VITE_SOCKET_URL=http://192.168.68.73:3001
```

### Finding your LAN IP

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'
```

## 5. Start the App (Development)

### Terminal 1 — Backend server:
```bash
cd server
npm run dev
```

Expected output:
```
Connected to Redis
mediasoup: 4 workers created
Server running on port 3001
```

### Terminal 2 — Frontend dev server:
```bash
cd web
npm run dev -- --host
```

Expected output:
```
VITE v7.3.1 ready in 155 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.68.73:5173/
```

### Access the app:
- **This computer**: http://localhost:5173
- **Other computers on LAN**: http://192.168.68.73:5173

## 6. Start TURN Server (for calls across NATs)

```bash
# From project root
docker-compose up -d coturn
```

Verify coturn is running:
```bash
docker-compose logs coturn
```

**Important**: Update `coturn/turnserver.conf` with your server's IP:
```
external-ip=YOUR_SERVER_IP
```

## 7. Production Deployment

### Build the React app:
```bash
cd web
npm run build
```

This creates `web/dist/` with static files.

### Start Nginx:
```bash
# From project root
docker-compose up -d nginx
```

Nginx serves the built React app and proxies API/WebSocket to Node.js.

### Start everything:
```bash
docker-compose up -d
cd server && npm start
```

### With SSL (HTTPS):

1. Get a domain name pointing to your server
2. Generate SSL certificates (Let's Encrypt):
   ```bash
   sudo certbot certonly --standalone -d yourdomain.com
   ```
3. Copy certs to `nginx/certs/`:
   ```bash
   cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/certs/
   cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/certs/
   ```
4. Edit `nginx/nginx.conf` — uncomment the HTTPS server block and the HTTP→HTTPS redirect
5. Update `server_name` to your domain
6. Restart nginx: `docker-compose restart nginx`

## 8. Common Commands

| Task | Command |
|------|---------|
| Start databases | `docker-compose up -d postgres redis` |
| Start TURN server | `docker-compose up -d coturn` |
| Start backend (dev) | `cd server && npm run dev` |
| Start backend (prod) | `cd server && npm start` |
| Start frontend (dev) | `cd web && npm run dev -- --host` |
| Build frontend | `cd web && npm run build` |
| Run migrations | `cd server && npm run migrate` |
| Rollback migrations | `cd server && npm run migrate:rollback` |
| Start everything (prod) | `docker-compose up -d && cd server && npm start` |
| View logs | `docker-compose logs -f <service>` |
| Stop all Docker services | `docker-compose down` |
| Stop + delete data | `docker-compose down -v` |

## 9. Troubleshooting

### Port already in use

```bash
# Find what's using the port
lsof -i :3001

# Kill it
kill $(lsof -ti:3001)
```

Common port conflicts:
- **6379** — Local Redis. That's why we use 6380.
- **3001** — Previous server instance. Kill it first.
- **5432** — Local PostgreSQL. Stop it or change the Docker port.

### Server crashes on start

1. Check that Docker containers are running: `docker-compose ps`
2. Check Redis is on port 6380: verify `REDIS_PORT=6380` in `server/.env`
3. Check PostgreSQL is accessible: `docker-compose logs postgres`
4. Check full error: `cd server && node src/index.js` (shows stack trace without nodemon noise)

### Calls not connecting

1. **Check mediasoup workers started**: Server log should show `mediasoup: X workers created`
2. **Check MEDIASOUP_ANNOUNCED_IP** in `server/.env` matches your LAN IP
3. **Browser permissions**: Ensure microphone/camera access is granted
4. **coturn not running**: Start it with `docker-compose up -d coturn`
5. **Check browser console** for `Consume error` messages — indicates RTP capability mismatch

### Can't access from other computer

1. Ensure Vite is started with `--host` flag
2. Check firewall isn't blocking ports 5173 (web) and 3001 (API)
3. Verify `web/.env` has the correct IP (not localhost)
4. Both computers must be on the same network

### Database migration fails

```bash
# Check PostgreSQL is running
docker-compose logs postgres

# Verify connection
docker exec -it project-1-postgres-1 psql -U chatcall_user -d chatcall -c "SELECT 1"

# If tables exist from a previous run, rollback first
cd server && npm run migrate:rollback && npm run migrate
```

## 10. Development Workflow

### Adding a new feature:

1. **Database changes** — Create a new migration:
   ```bash
   cd server
   npx knex migrate:make my_new_table --knexfile src/config/knexfile.js
   ```

2. **API endpoint** — Add route in `server/src/routes/`

3. **Socket event** — Add handler in `server/src/socket/`

4. **Frontend** — Add component in `web/src/components/`, hook in `hooks/`, or update existing pages

5. **Test** — Open two browser tabs, register two users, and test the feature

### File structure conventions:

- **Routes**: One file per resource (`auth.js`, `users.js`, `chats.js`)
- **Socket handlers**: One file per domain (`chat.js`, `presence.js`, `signaling.js`)
- **Components**: Grouped by feature (`Auth/`, `Chat/`, `Call/`, `Shared/`)
- **Context**: Global state providers (`AuthContext`, `SocketContext`)
- **Services**: API and socket connection managers
- **Hooks**: Reusable logic (`useNotification`)

## 11. Where We Left Off

### Completed:
- Full auth system (register, login, JWT refresh)
- Contact management
- Direct and group messaging with typing/read receipts
- Online presence (Redis-backed)
- Audio/video calls via mediasoup SFU (1:1 and group)
- Browser notifications + in-app toast alerts + sounds
- coturn TURN/STUN config
- Nginx reverse proxy config
- Dark theme UI

### Next steps to implement:
1. **File/image sharing** — Multer upload endpoint + message type support
2. **React Native mobile app** — Share API/socket logic from web
3. **Message search** — Full-text search across conversations
4. **Screen sharing** — Add screen track to mediasoup producer
5. **Message reactions** — Emoji reactions on messages
6. **Call logs persistence** — Write to call_logs table on call end
