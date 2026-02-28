# ChatCall - Technical Specification

## 1. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React + Vite | React 19, Vite 7 |
| **Backend** | Node.js + Express | Express 4.18 |
| **Real-time** | Socket.io | 4.7 |
| **Media (SFU)** | mediasoup / mediasoup-client | 3.x |
| **Database** | PostgreSQL | 16 (Alpine) |
| **Cache/Pub-Sub** | Redis | 7 (Alpine) |
| **TURN/STUN** | coturn | Latest |
| **Reverse Proxy** | Nginx | Alpine |
| **ORM/Query Builder** | Knex.js | 3.1 |
| **Auth** | JWT (jsonwebtoken) | 9.x |
| **HTTP Client** | Axios | 1.x |
| **Routing** | react-router-dom | 7.x |

## 2. Project Structure

```
project-1/
├── docs/                           # Documentation
├── server/                         # Node.js backend
│   ├── src/
│   │   ├── index.js                # Entry point — Express + Socket.io + mediasoup init
│   │   ├── config/
│   │   │   ├── db.js               # Knex PostgreSQL connection
│   │   │   ├── knexfile.js         # Knex configuration (dev + prod)
│   │   │   ├── redis.js            # Redis client connection
│   │   │   ├── mediasoup.js        # mediasoup worker/router/transport config
│   │   │   └── migrations/         # 5 database migration files
│   │   ├── middleware/
│   │   │   └── auth.js             # JWT authenticate + generateTokens
│   │   ├── routes/
│   │   │   ├── auth.js             # POST register, login, refresh; GET /me
│   │   │   ├── users.js            # GET search, contacts, pending; POST/PATCH contacts
│   │   │   └── chats.js            # GET conversations, messages; POST conversations
│   │   ├── socket/
│   │   │   ├── chat.js             # Message send/receive, typing, read receipts
│   │   │   ├── presence.js         # Online/offline via Redis sets
│   │   │   └── signaling.js        # Call control + mediasoup SFU signaling
│   │   └── media/
│   │       └── MediasoupManager.js # Singleton managing workers, rooms, peers
│   ├── .env                        # Environment variables
│   └── package.json
├── web/                            # React frontend
│   ├── src/
│   │   ├── main.jsx                # React entry point
│   │   ├── App.jsx                 # Router + providers (Auth, Socket, Toast)
│   │   ├── App.css                 # Complete dark theme UI styles
│   │   ├── index.css               # Base reset styles
│   │   ├── context/
│   │   │   ├── AuthContext.jsx     # Auth state, login/register/logout, socket connect
│   │   │   └── SocketContext.jsx   # Online presence tracking
│   │   ├── services/
│   │   │   ├── api.js              # Axios instance with JWT interceptor + auto-refresh
│   │   │   └── socket.js           # Socket.io connection manager
│   │   ├── hooks/
│   │   │   └── useNotification.js  # Browser Notification API + Web Audio sounds
│   │   ├── pages/
│   │   │   └── ChatPage.jsx        # Main layout — sidebar + chat/call area + notifications
│   │   └── components/
│   │       ├── Auth/
│   │       │   ├── Login.jsx       # Login form
│   │       │   └── Register.jsx    # Registration form
│   │       ├── Chat/
│   │       │   ├── ChatList.jsx    # Conversation list + user search
│   │       │   └── MessageThread.jsx # Message display + input + typing indicators
│   │       ├── Call/
│   │       │   └── CallScreen.jsx  # mediasoup-based call UI with video grid
│   │       └── Shared/
│   │           └── Toast.jsx       # Toast notification system (context + provider)
│   ├── .env                        # VITE_API_URL, VITE_SOCKET_URL
│   └── package.json
├── docker-compose.yml              # PostgreSQL, Redis, coturn, Nginx
├── coturn/
│   └── turnserver.conf             # TURN server configuration
├── nginx/
│   ├── nginx.conf                  # Reverse proxy config (HTTP + HTTPS ready)
│   └── certs/                      # SSL certificate directory (empty)
├── uploads/                        # File upload directory (future)
└── .gitignore
```

## 3. Database Schema

### Tables & Relationships

```
users
  ├── id (UUID, PK)
  ├── username (VARCHAR 50, UNIQUE)
  ├── email (VARCHAR 255, UNIQUE)
  ├── password_hash (VARCHAR 255)
  ├── avatar_url (VARCHAR 500, nullable)
  ├── status (VARCHAR 200, default: '')
  ├── created_at (TIMESTAMP)
  └── updated_at (TIMESTAMP)

contacts
  ├── id (UUID, PK)
  ├── user_id (UUID, FK → users.id ON DELETE CASCADE)
  ├── contact_id (UUID, FK → users.id ON DELETE CASCADE)
  ├── status (ENUM: pending | accepted | blocked)
  ├── created_at (TIMESTAMP)
  └── UNIQUE(user_id, contact_id)

conversations
  ├── id (UUID, PK)
  ├── type (ENUM: direct | group)
  ├── name (VARCHAR 100, nullable — used for groups)
  ├── created_by (UUID, FK → users.id ON DELETE SET NULL)
  └── created_at (TIMESTAMP)

conversation_members
  ├── conversation_id (UUID, FK → conversations.id ON DELETE CASCADE)
  ├── user_id (UUID, FK → users.id ON DELETE CASCADE)
  ├── joined_at (TIMESTAMP)
  └── PK(conversation_id, user_id)

messages
  ├── id (UUID, PK)
  ├── conversation_id (UUID, FK → conversations.id ON DELETE CASCADE)
  ├── sender_id (UUID, FK → users.id ON DELETE CASCADE)
  ├── content (TEXT)
  ├── type (ENUM: text | image | file | voice)
  ├── file_url (VARCHAR 500, nullable)
  ├── read_by (JSONB, default: [])
  ├── created_at (TIMESTAMP)
  └── INDEX(conversation_id, created_at)

call_logs
  ├── id (UUID, PK)
  ├── conversation_id (UUID, FK → conversations.id ON DELETE CASCADE)
  ├── initiator_id (UUID, FK → users.id ON DELETE CASCADE)
  ├── type (ENUM: audio | video)
  ├── status (ENUM: missed | answered | declined)
  ├── started_at (TIMESTAMP)
  ├── ended_at (TIMESTAMP, nullable)
  └── participants (JSONB, default: [])
```

## 4. REST API Endpoints

### Auth (`/api/auth`)
| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| POST | `/register` | No | `{ username, email, password }` | `{ user, accessToken, refreshToken }` |
| POST | `/login` | No | `{ email, password }` | `{ user, accessToken, refreshToken }` |
| POST | `/refresh` | No | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| GET | `/me` | JWT | — | `{ id, username, email, avatar_url, status }` |

### Users (`/api/users`) — all require JWT
| Method | Path | Body/Query | Response |
|--------|------|------------|----------|
| GET | `/search?q=` | query min 2 chars | `[{ id, username, avatar_url, status }]` (max 20) |
| GET | `/contacts` | — | `[{ id, username, avatar_url, status }]` |
| GET | `/contacts/pending` | — | `[{ id, username, avatar_url, created_at }]` |
| POST | `/contacts/:contactId` | — | `{ message }` |
| PATCH | `/contacts/:contactId` | `{ status: accepted|blocked }` | `{ message }` |

### Chats (`/api/chats`) — all require JWT
| Method | Path | Body/Query | Response |
|--------|------|------------|----------|
| GET | `/conversations` | — | `[{ ...conv, members, lastMessage }]` |
| POST | `/conversations` | `{ type, name?, memberIds[] }` | `{ ...conv, members }` |
| GET | `/conversations/:id/messages` | `?limit=50&before=<timestamp>` | `[{ id, content, type, sender_id, sender_username, ... }]` |

### System
| Method | Path | Response |
|--------|------|----------|
| GET | `/api/health` | `{ status: "ok", timestamp }` |

## 5. WebSocket Events

### Chat Events
| Event | Direction | Data |
|-------|-----------|------|
| `chat:join` | Client → Server | `conversationId` |
| `chat:leave` | Client → Server | `conversationId` |
| `chat:message` | Client → Server | `{ conversationId, content, type }` |
| `chat:message` | Server → Room | Full message + sender info |
| `chat:typing` | Client ↔ Server | `{ conversationId }` / `{ conversationId, userId, username }` |
| `chat:stopTyping` | Client ↔ Server | `{ conversationId }` / `{ conversationId, userId }` |
| `chat:markRead` | Client → Server | `{ conversationId, messageIds[] }` |
| `chat:read` | Server → Room | `{ conversationId, userId, messageIds[] }` |

### Presence Events
| Event | Direction | Data |
|-------|-----------|------|
| `presence:getOnline` | Client → Server | — |
| `presence:onlineList` | Server → Client | `[userId, ...]` |
| `presence:online` | Server → All | `{ userId }` |
| `presence:offline` | Server → All | `{ userId }` |

### Call Signaling Events
| Event | Direction | Data |
|-------|-----------|------|
| `call:initiate` | Client → Server | `{ conversationId, callType, targetUserIds[] }` |
| `call:incoming` | Server → Target | `{ conversationId, callType, callerId, callerName }` |
| `call:accept` | Client → Server | `{ conversationId, callerId }` |
| `call:accepted` | Server → Caller | `{ conversationId, userId, username }` |
| `call:decline` | Client → Server | `{ conversationId, callerId }` |
| `call:declined` | Server → Caller | `{ conversationId, userId }` |
| `call:end` | Client → Server | `{ conversationId }` |
| `call:peerLeft` | Server → Room | `{ userId }` |
| `call:ended` | Server → Room | `{}` |

### mediasoup Media Events (all use callbacks)
| Event | Direction | Data |
|-------|-----------|------|
| `media:getRouterCapabilities` | Client → Server | `{ conversationId }` → `{ rtpCapabilities }` |
| `media:setRtpCapabilities` | Client → Server | `{ conversationId, rtpCapabilities }` → `{ success }` |
| `media:createTransport` | Client → Server | `{ conversationId }` → `{ id, iceParameters, iceCandidates, dtlsParameters }` |
| `media:connectTransport` | Client → Server | `{ conversationId, transportId, dtlsParameters }` → `{ success }` |
| `media:produce` | Client → Server | `{ conversationId, transportId, kind, rtpParameters }` → `{ id }` |
| `media:consume` | Client → Server | `{ conversationId, transportId, producerId }` → `{ id, producerId, kind, rtpParameters }` |
| `media:resumeConsumer` | Client → Server | `{ conversationId, consumerId }` |
| `media:getProducers` | Client → Server | `{ conversationId }` → `[{ producerId, userId, kind }]` |
| `media:newProducer` | Server → Room | `{ producerId, userId, kind }` |
| `media:peerLeft` | Server → Room | `{ userId }` |

## 6. Authentication Flow

```
Register/Login
    │
    ▼
Server returns { accessToken (15m), refreshToken (7d) }
    │
    ▼
Client stores both in localStorage
    │
    ▼
Every API request → Authorization: Bearer <accessToken>
    │
    ▼
On 401 → Axios interceptor auto-calls /auth/refresh
    │
    ▼
Socket.io connects with auth: { token: accessToken }
    │
    ▼
Socket middleware verifies JWT → sets socket.userId, socket.username
```

## 7. Call Flow (mediasoup SFU)

```
Caller                        Server                       Callee
  │                              │                            │
  ├── call:initiate ────────────►│                            │
  │   (joins call:room)          ├── call:incoming ──────────►│
  │                              │                            │
  │                              │◄── call:accept ────────────┤
  │◄── call:accepted ────────────┤   (joins call:room)        │
  │                              │                            │
  ├── getRouterCapabilities ────►│◄── getRouterCapabilities ──┤
  ├── setRtpCapabilities ───────►│◄── setRtpCapabilities ─────┤
  ├── createTransport (send) ───►│◄── createTransport (send) ─┤
  ├── createTransport (recv) ───►│◄── createTransport (recv) ─┤
  ├── produce (audio/video) ────►│◄── produce (audio/video) ──┤
  │                              │                            │
  │   Server broadcasts media:newProducer to other peers      │
  │                              │                            │
  ├── consume (callee's media) ─►│◄── consume (caller media) ─┤
  ├── resumeConsumer ───────────►│◄── resumeConsumer ──────────┤
  │                              │                            │
  │   ◄════════ Media streams flowing via SFU ════════►       │
```

## 8. Environment Variables

### Server (`server/.env`)
```
PORT=3001
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chatcall
DB_USER=chatcall_user
DB_PASSWORD=changeme_in_production
REDIS_HOST=localhost
REDIS_PORT=6380
JWT_SECRET=<random-secret>
JWT_REFRESH_SECRET=<random-secret>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
MEDIASOUP_ANNOUNCED_IP=192.168.68.73
TURN_SERVER_URL=turn:192.168.68.73:3478
TURN_USERNAME=chatcall
TURN_PASSWORD=chatcall_turn_secret
UPLOAD_DIR=../uploads
MAX_FILE_SIZE=10485760
```

### Web (`web/.env`)
```
VITE_API_URL=http://192.168.68.73:3001/api
VITE_SOCKET_URL=http://192.168.68.73:3001
```

## 9. Key Dependencies

### Server
| Package | Purpose |
|---------|---------|
| express | HTTP server & REST API |
| socket.io | WebSocket real-time communication |
| mediasoup | SFU media server (audio/video routing) |
| knex + pg | PostgreSQL query builder & migrations |
| redis | Presence tracking, session cache |
| bcryptjs | Password hashing (12 rounds) |
| jsonwebtoken | JWT access/refresh tokens |
| helmet | HTTP security headers |
| cors | Cross-origin requests |
| multer | File upload handling (future) |

### Web
| Package | Purpose |
|---------|---------|
| react + react-dom | UI framework |
| react-router-dom | Client-side routing |
| axios | HTTP client with interceptors |
| socket.io-client | WebSocket client |
| mediasoup-client | SFU client (Device, Transport, Producer, Consumer) |
