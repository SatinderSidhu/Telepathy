import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

let socket = null;

export function connectSocket(token) {
  if (socket?.connected) {
    console.log('[Socket] Already connected, returning existing socket');
    return socket;
  }

  console.log('[Socket] Connecting to:', SOCKET_URL);
  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('[Socket] ✅ Connected successfully! Socket ID:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] ❌ Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] ❌ Connection error:', err.message, err);
  });

  socket.on('error', (err) => {
    console.error('[Socket] ❌ Socket error:', err);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
