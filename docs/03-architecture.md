# ChatCall - Architecture Document

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                              │
│                                                             │
│   ┌──────────────┐              ┌───────────────────┐       │
│   │  React Web   │              │   React Native    │       │
│   │  (Vite)      │              │   (Planned)       │       │
│   │              │              │                   │       │
│   │ - Auth UI    │              │ - Shared API/     │       │
│   │ - Chat UI    │              │   socket logic    │       │
│   │ - Call UI    │              │                   │       │
│   │ - mediasoup  │              │                   │       │
│   │   client     │              │                   │       │
│   └──────┬───────┘              └────────┬──────────┘       │
│          │                               │                  │
└──────────┼───────────────────────────────┼──────────────────┘
           │ HTTPS / WSS                   │
           └──────────┬────────────────────┘
                      ▼
         ┌────────────────────────┐
         │   Nginx Reverse Proxy  │
         │                        │
         │  - SSL termination     │
         │  - Static file serving │
         │  - /api/ → Node.js    │
         │  - /socket.io/ → WS   │
         └───────────┬────────────┘
                     │
    ┌────────────────┼─────────────────┐
    │                │                 │
    ▼                ▼                 ▼
┌─────────┐  ┌────────────┐  ┌──────────────┐
│ REST API │  │ Socket.io  │  │  mediasoup   │
│ Express  │  │ Server     │  │  SFU Server  │
│          │  │            │  │              │
│ /auth    │  │ Chat msgs  │  │ Workers (x4) │
│ /users   │  │ Presence   │  │ Routers      │
│ /chats   │  │ Signaling  │  │ Transports   │
│ /health  │  │            │  │ Producers    │
│          │  │            │  │ Consumers    │
└────┬─────┘  └─────┬──────┘  └──────┬───────┘
     │              │                │
     │              │                │
     ▼              ▼                │
┌──────────┐ ┌───────────┐          │
│PostgreSQL│ │   Redis   │          │
│          │ │           │          │
│ Users    │ │ Presence  │          │
│ Messages │ │ (online   │          │
│ Contacts │ │  user set)│          │
│ Convos   │ │           │          │
│ CallLogs │ │           │          │
└──────────┘ └───────────┘          │
                                    │
                            ┌───────▼───────┐
                            │    coturn      │
                            │  TURN/STUN    │
                            │               │
                            │ Port 3478     │
                            │ UDP 40000-    │
                            │     49999     │
                            └───────────────┘
```

## 2. Component Architecture

### 2.1 Backend (Node.js Server)

All backend components run in a single Node.js process (`server/src/index.js`):

```
index.js
  │
  ├── Express App
  │   ├── helmet()          — Security headers
  │   ├── cors()            — Cross-origin config
  │   ├── express.json()    — Body parsing
  │   │
  │   ├── /api/auth         — routes/auth.js
  │   ├── /api/users        — routes/users.js
  │   ├── /api/chats        — routes/chats.js
  │   └── /api/health       — Inline health check
  │
  ├── Socket.io Server
  │   ├── Auth middleware   — JWT verification on connect
  │   ├── chat.js           — Message handlers
  │   ├── presence.js       — Online/offline tracking
  │   └── signaling.js      — Call control + mediasoup signaling
  │
  ├── MediasoupManager      — Singleton
  │   ├── Workers[]         — 1 per CPU core (max 4)
  │   └── Rooms Map         — conversationId → { router, peers }
  │       └── Peer          — { transports, producers, consumers, rtpCapabilities }
  │
  ├── PostgreSQL (Knex)     — config/db.js
  └── Redis                 — config/redis.js
```

### 2.2 Frontend (React Web)

```
App.jsx
  │
  ├── BrowserRouter
  │   └── ToastProvider          — Global toast notifications
  │       └── AuthProvider       — Auth state + socket lifecycle
  │           └── AppRoutes
  │               ├── /login     → Login.jsx
  │               ├── /register  → Register.jsx
  │               └── /          → SocketProvider → ChatPage.jsx
  │
  ChatPage.jsx
  │
  ├── Sidebar
  │   ├── User info + logout
  │   └── ChatList.jsx
  │       ├── User search (API)
  │       ├── Conversation list (API + socket updates)
  │       └── Online indicators (SocketContext)
  │
  ├── Main Area
  │   ├── MessageThread.jsx      — Active when no call
  │   │   ├── Message history (API + socket)
  │   │   ├── Message input
  │   │   ├── Typing indicators
  │   │   └── Call buttons (audio/video)
  │   │
  │   └── CallScreen.jsx         — Active during call
  │       ├── mediasoup Device
  │       ├── Send/Recv Transports
  │       ├── Video grid (remote streams)
  │       ├── Local video PIP
  │       └── Call controls
  │
  └── Incoming Call Overlay       — Modal with accept/decline
```

### 2.3 Service Layer

```
services/
  ├── api.js
  │   ├── Axios instance (baseURL: VITE_API_URL)
  │   ├── Request interceptor → attach JWT
  │   └── Response interceptor → auto-refresh on 401
  │
  └── socket.js
      ├── connectSocket(token)   — Create/return socket instance
      ├── getSocket()            — Get existing socket
      └── disconnectSocket()     — Cleanup
```

## 3. Data Flow

### 3.1 Chat Message Flow

```
User types message → MessageThread.jsx
  │
  ├── socket.emit('chat:message', { conversationId, content, type })
  │
  ▼
Server: socket/chat.js
  │
  ├── Verify membership in conversation_members table
  ├── INSERT into messages table (PostgreSQL)
  ├── Query sender info from users table
  │
  ├── io.to(conversationId).emit('chat:message', fullMessage)
  │
  ▼
All clients in room receive the message
  │
  ├── MessageThread: Append to messages state
  ├── ChatList: Reload conversations (update last message)
  └── ChatPage: If message is from another chat → toast + browser notification
```

### 3.2 Call Connection Flow

```
Phase 1: Signaling
─────────────────
Caller clicks call → ChatPage.handleStartCall()
  → setActiveCall() → renders CallScreen
  → CallScreen.startCall() → socket.emit('call:initiate')
  → Server joins caller to call:room
  → Server sends call:incoming to each target user

Callee sees incoming call overlay → clicks Accept
  → ChatPage.handleAcceptIncoming()
  → setActiveCall({ conversationId }) → renders CallScreen
  → CallScreen.acceptCall() → socket.emit('call:accept')
  → Server joins callee to call:room
  → Server sends call:accepted to caller

Phase 2: mediasoup Setup (both peers)
─────────────────────────────────────
  1. getRouterCapabilities → server returns router.rtpCapabilities
  2. new mediasoupClient.Device() → device.load(routerRtpCapabilities)
  3. setRtpCapabilities → server stores peer capabilities (with callback)
  4. createTransport (send) → server creates WebRtcTransport
  5. createTransport (recv) → server creates WebRtcTransport
  6. produce (audio + video) → tracks sent to SFU
     → server broadcasts media:newProducer to other peers
  7. getProducers → fetch existing producers from server
  8. consume each producer → subscribe to remote tracks
  9. resumeConsumer → start receiving media

Phase 3: Media Streaming
────────────────────────
  Audio/Video flows: Client → SFU → Other Clients
  SFU selectively forwards (does NOT mix/transcode)
```

### 3.3 Presence Flow

```
User connects socket
  │
  ├── Server: presence.js → setOnline()
  │   ├── Redis SET presence:<userId> "online"
  │   ├── Redis SADD online_users <userId>
  │   └── io.emit('presence:online', { userId })
  │
  ├── Client: SocketContext listens for presence events
  │   └── Maintains onlineUsers[] state
  │
  └── ChatList.jsx reads onlineUsers to show green dots

User disconnects
  │
  └── Server: socket 'disconnect' → setOffline()
      ├── Redis DEL presence:<userId>
      ├── Redis SREM online_users <userId>
      └── io.emit('presence:offline', { userId })
```

## 4. mediasoup SFU Architecture

```
MediasoupManager (Singleton)
  │
  ├── Workers[0..3]           — OS-level processes, 1 per CPU core
  │   └── (round-robin assignment to rooms)
  │
  └── Rooms Map
      │
      └── Room (per conversationId)
          │
          ├── Router            — Manages RTP routing for this room
          │   ├── mediaCodecs: [opus, VP8, H264]
          │   └── canConsume()  — Checks codec compatibility
          │
          └── Peers Map (per userId)
              │
              ├── rtpCapabilities  — Client's supported codecs
              │
              ├── Transports Map
              │   ├── Send Transport  — Client → SFU
              │   │   ├── ICE parameters
              │   │   ├── DTLS parameters
              │   │   └── Producers[]
              │   │       ├── Audio Producer (opus)
              │   │       └── Video Producer (VP8/H264)
              │   │
              │   └── Recv Transport  — SFU → Client
              │       └── Consumers[]
              │           ├── Consumer for PeerB's audio
              │           ├── Consumer for PeerB's video
              │           ├── Consumer for PeerC's audio
              │           └── Consumer for PeerC's video
              │
              └── (cleanup on disconnect: close transports → auto-closes producers/consumers)
```

### Port Usage

| Port | Protocol | Service |
|------|----------|---------|
| 80 | TCP | Nginx HTTP |
| 443 | TCP | Nginx HTTPS |
| 3001 | TCP | Node.js (API + Socket.io) |
| 3478 | TCP/UDP | coturn TURN/STUN |
| 5432 | TCP | PostgreSQL |
| 6380 | TCP | Redis (remapped from 6379) |
| 40000-49999 | UDP | mediasoup RTP + coturn relay |

## 5. Security Architecture

```
Client                          Server
  │                               │
  ├── HTTPS (Nginx SSL) ────────►│  Transport encryption
  │                               │
  ├── JWT in Authorization ─────►│  authenticate() middleware
  │   header (Bearer token)       │  verifies on every request
  │                               │
  ├── Socket auth.token ────────►│  io.use() middleware
  │   (on handshake)              │  verifies on connect
  │                               │
  │                               ├── bcrypt(password, 12) — hashing
  │                               ├── helmet() — security headers
  │                               ├── cors() — origin restriction
  │                               ├── rate-limit — (available, not configured)
  │                               │
  │                               ├── Membership checks on every
  │                               │   message send & message read
  │                               │
  │                               └── DTLS encryption on
  │                                   mediasoup transports
```

### Token Lifecycle

```
Access Token:  15 minutes  → Used for API calls + socket auth
Refresh Token: 7 days      → Used to get new access token

On 401 response:
  1. Axios interceptor catches it
  2. Calls POST /auth/refresh with refreshToken
  3. Stores new tokens in localStorage
  4. Retries original request
  5. If refresh fails → redirect to /login
```

## 6. Docker Infrastructure

```
docker-compose.yml
  │
  ├── postgres (postgres:16-alpine)
  │   ├── Port: 5432
  │   ├── Volume: pgdata (persistent)
  │   └── DB: chatcall / chatcall_user
  │
  ├── redis (redis:7-alpine)
  │   ├── Port: 6380 → 6379 (remapped, local Redis on 6379)
  │   └── Volume: redisdata (persistent)
  │
  ├── coturn (coturn/coturn:latest)
  │   ├── network_mode: host (needs direct UDP access)
  │   ├── Config: ./coturn/turnserver.conf
  │   └── Ports: 3478 + 40000-49999 UDP
  │
  └── nginx (nginx:alpine)
      ├── Ports: 80, 443
      ├── Config: ./nginx/nginx.conf
      ├── Static: ./web/dist (built React app)
      └── Certs: ./nginx/certs (for HTTPS)
```

## 7. Known Design Decisions & Trade-offs

| Decision | Rationale |
|----------|-----------|
| **mediasoup for 1:1 calls too** | Keeps architecture consistent; avoids maintaining two call paths (peer-to-peer + SFU) |
| **Redis for presence only** | Lightweight use; sessions are stateless JWT, not stored in Redis |
| **Knex instead of full ORM** | Simpler, more control over SQL, no magic; good for this scale |
| **Single Node.js process** | Express + Socket.io + mediasoup all in one; simpler deployment. Can be split later if needed |
| **coturn with network_mode: host** | TURN needs direct UDP port access; Docker NAT would break it |
| **Nginx serves built React** | In production, Nginx serves static files and proxies API; no need for Vite in prod |
| **Fire-and-forget typing events** | Not persisted; ephemeral UX indicators don't need database |
| **JSONB for read_by** | Flexible; avoids a separate read_receipts join table for now |
