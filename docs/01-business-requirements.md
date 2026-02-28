# ChatCall - Business Requirements Document

## 1. Overview

ChatCall is a self-hosted chat and video/audio calling application. It allows users to communicate in real-time through text messaging and voice/video calls, all running on the user's own server with no cloud dependencies.

## 2. Target Users

- Individuals or teams who want full control over their communication data
- Organizations needing a private, self-hosted alternative to Slack/Teams/Zoom
- Developers wanting a customizable communication platform

## 3. Platforms

| Platform | Technology | Status |
|----------|-----------|--------|
| Web | React (Vite) | Implemented |
| Mobile (iOS/Android) | React Native | Planned |

## 4. Core Features

### 4.1 User Management
- **Registration** — Sign up with username, email, and password
- **Login/Logout** — JWT-based authentication with automatic token refresh
- **Profile** — Avatar, status message
- **User Search** — Find other users by username

### 4.2 Contacts
- **Send contact request** — Request to connect with another user
- **Accept/Block** — Manage incoming requests
- **Pending requests** — View unanswered requests
- **Contact list** — View accepted contacts with online status

### 4.3 Messaging
- **Direct messages** — 1:1 private conversations
- **Group chats** — Multi-user conversations with a group name
- **Real-time delivery** — Messages appear instantly via WebSocket
- **Message history** — Paginated, persisted in PostgreSQL
- **Typing indicators** — See when someone is typing
- **Read receipts** — Know when messages have been seen
- **Message types** — Text (image, file, voice planned)

### 4.4 Voice & Video Calls
- **1:1 audio calls** — Direct voice calls between two users
- **1:1 video calls** — Direct video calls between two users
- **Group calls** — Multi-participant audio/video via mediasoup SFU
- **Call controls** — Mute, camera toggle, end call
- **Incoming call UI** — Modal overlay with accept/decline
- **NAT traversal** — coturn TURN/STUN server for connectivity across networks

### 4.5 Notifications
- **Browser notifications** — Push notifications when app is not focused (new messages, incoming calls)
- **In-app toasts** — Slide-in toast alerts for messages from other chats and incoming calls
- **Sound alerts** — Audio feedback for new messages (ping) and incoming calls (ring pattern)

### 4.6 Presence
- **Online/Offline status** — Real-time presence indicators on contacts and chat list
- **Redis-backed** — Efficient tracking of connected users

## 5. Non-Functional Requirements

| Requirement | Detail |
|-------------|--------|
| **Self-hosted** | All services run on user's own server, no cloud accounts needed |
| **Containerized** | PostgreSQL, Redis, coturn, Nginx run in Docker |
| **Security** | Passwords hashed with bcrypt (12 rounds), JWT auth, Helmet security headers |
| **Scalability** | mediasoup uses 1 worker per CPU core (max 4) |
| **SSL-ready** | Nginx config includes HTTPS section (needs domain + certs) |
| **Data ownership** | All data stays on the user's server |

## 6. Current Implementation Status

| Feature | Status |
|---------|--------|
| User auth (register, login, JWT refresh) | Done |
| Contacts (add, accept, block, pending) | Done |
| Direct messaging | Done |
| Group conversations | Done |
| Typing indicators & read receipts | Done |
| Online presence | Done |
| 1:1 audio/video calls (mediasoup SFU) | Done |
| Group calls (mediasoup SFU) | Done |
| Browser & in-app notifications | Done |
| coturn TURN/STUN server | Done (config ready) |
| Nginx reverse proxy | Done (config ready) |
| File/image sharing | Not started |
| React Native mobile app | Not started |
| End-to-end encryption | Not started |
| Push notifications (mobile) | Not started |

## 7. Future Roadmap

1. **File & image sharing** — Upload and send files/images/voice messages in chat
2. **Mobile app** — React Native client sharing API/socket logic with web
3. **Message search** — Full-text search across conversations
4. **End-to-end encryption** — Optional E2EE for private conversations
5. **Screen sharing** — Share screen during video calls
6. **Message reactions** — Emoji reactions on messages
7. **Admin panel** — User management, server health dashboard
