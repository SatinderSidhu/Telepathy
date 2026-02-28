# Telepathy

A self-hosted chat and video calling application. Own your communication — no cloud, no third-party services, everything runs on your server.

## What is Telepathy?

Telepathy is a full-stack real-time communication platform that gives you complete control over your data. It supports instant messaging, audio calls, and video calls (including group calls) — all routed through your own infrastructure.

Built for anyone who values privacy, wants to avoid vendor lock-in, or simply wants to run their own communication tool for a team, family, or community.

## Features

- **Real-time messaging** — Instant delivery with typing indicators and read receipts
- **Voice & video calls** — 1:1 and group calls powered by mediasoup SFU
- **Group chats** — Create multi-user conversations
- **Online presence** — See who's online in real-time
- **Notifications** — Browser push notifications, in-app toast alerts, and sound effects
- **Contact management** — Add contacts, accept/block requests
- **Dark theme UI** — Clean, modern interface
- **Fully self-hosted** — PostgreSQL, Redis, TURN server, and Nginx all run on your machine via Docker

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite |
| Backend | Node.js + Express + Socket.io |
| Media Server | mediasoup (SFU) |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| TURN/STUN | coturn |
| Reverse Proxy | Nginx |

## Quick Start

```bash
# 1. Start databases
docker-compose up -d postgres redis

# 2. Install dependencies
cd server && npm install && cd ../web && npm install && cd ..

# 3. Run database migrations
cd server && npm run migrate

# 4. Start the backend
cd server && npm run dev

# 5. Start the frontend (in a new terminal)
cd web && npm run dev -- --host
```

Open **http://localhost:5173** and create an account.

See the full [Setup & Run Guide](docs/04-setup-and-run-guide.md) for detailed instructions, production deployment, and troubleshooting.

## Documentation

| Document | Description |
|----------|-------------|
| [Business Requirements](docs/01-business-requirements.md) | Features, user stories, implementation status, and roadmap |
| [Technical Specification](docs/02-technical-specification.md) | API endpoints, socket events, database schema, auth flow |
| [Architecture](docs/03-architecture.md) | System diagrams, data flows, mediasoup SFU internals, security model |
| [Setup & Run Guide](docs/04-setup-and-run-guide.md) | Installation, configuration, deployment, and troubleshooting |

## Project Structure

```
telepathy/
├── server/          # Node.js backend (API + Socket.io + mediasoup)
├── web/             # React frontend (Vite)
├── docs/            # Project documentation
├── coturn/          # TURN server configuration
├── nginx/           # Reverse proxy configuration
└── docker-compose.yml
```

## License

This project is private and not currently licensed for distribution.
