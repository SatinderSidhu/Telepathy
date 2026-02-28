const { redisClient } = require('../config/redis');

module.exports = function registerPresenceHandlers(io, socket) {
  // Set user online
  async function setOnline() {
    try {
      await redisClient.set(`presence:${socket.userId}`, 'online');
      await redisClient.sAdd('online_users', socket.userId);
      io.emit('presence:online', { userId: socket.userId });
    } catch (err) {
      console.error('Set online error:', err);
    }
  }

  // Set user offline
  async function setOffline() {
    try {
      await redisClient.del(`presence:${socket.userId}`);
      await redisClient.sRem('online_users', socket.userId);
      io.emit('presence:offline', { userId: socket.userId });
    } catch (err) {
      console.error('Set offline error:', err);
    }
  }

  setOnline();

  // Get online users
  socket.on('presence:getOnline', async () => {
    try {
      const onlineUsers = await redisClient.sMembers('online_users');
      socket.emit('presence:onlineList', onlineUsers);
    } catch (err) {
      console.error('Get online error:', err);
    }
  });

  socket.on('disconnect', () => {
    setOffline();
  });
};
