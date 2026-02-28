require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { connectRedis } = require('./config/redis');
const mediasoupManager = require('./media/MediasoupManager');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chats');

// Socket handlers
const registerChatHandlers = require('./socket/chat');
const registerPresenceHandlers = require('./socket/presence');
const registerSignalingHandlers = require('./socket/signaling');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json());

// REST routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Socket auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.username = decoded.username;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.username} (${socket.userId})`);

  // Join user's personal room for direct notifications
  socket.join(`user:${socket.userId}`);

  registerChatHandlers(io, socket);
  registerPresenceHandlers(io, socket);
  registerSignalingHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.username}`);
  });
});

// Start server
const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await connectRedis();
    await mediasoupManager.init();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
