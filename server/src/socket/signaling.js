const mediasoupManager = require('../media/MediasoupManager');

module.exports = function registerSignalingHandlers(io, socket) {
  // Initiate a call
  socket.on('call:initiate', (data) => {
    const { conversationId, callType, targetUserIds } = data;

    socket.join(`call:${conversationId}`);

    for (const userId of targetUserIds) {
      io.to(`user:${userId}`).emit('call:incoming', {
        conversationId,
        callType,
        callerId: socket.userId,
        callerName: socket.username,
      });
    }
  });

  // Accept a call — join the mediasoup room
  socket.on('call:accept', (data) => {
    const { conversationId, callerId } = data;

    socket.join(`call:${conversationId}`);

    io.to(`user:${callerId}`).emit('call:accepted', {
      conversationId,
      userId: socket.userId,
      username: socket.username,
    });
  });

  // Decline a call
  socket.on('call:decline', (data) => {
    const { conversationId, callerId } = data;
    io.to(`user:${callerId}`).emit('call:declined', {
      conversationId,
      userId: socket.userId,
    });
  });

  // End call — leave mediasoup room
  socket.on('call:end', (data) => {
    const { conversationId } = data;

    mediasoupManager.removePeer(conversationId, socket.userId);
    socket.leave(`call:${conversationId}`);

    socket.to(`call:${conversationId}`).emit('call:peerLeft', {
      userId: socket.userId,
    });

    // If room is now empty, notify
    const remaining = mediasoupManager.getPeersInRoom(conversationId);
    if (remaining.length === 0) {
      io.to(`call:${conversationId}`).emit('call:ended', {});
    }
  });

  // --- mediasoup SFU signaling ---

  // Get router RTP capabilities
  socket.on('media:getRouterCapabilities', async ({ conversationId }, callback) => {
    try {
      const room = await mediasoupManager.getOrCreateRoom(conversationId);
      callback({ rtpCapabilities: room.router.rtpCapabilities });
    } catch (err) {
      console.error('getRouterCapabilities error:', err);
      callback({ error: err.message });
    }
  });

  // Set client RTP capabilities
  socket.on('media:setRtpCapabilities', ({ conversationId, rtpCapabilities }, callback) => {
    mediasoupManager.setRtpCapabilities(conversationId, socket.userId, rtpCapabilities);
    if (callback) callback({ success: true });
  });

  // Create a WebRTC transport (send or receive)
  socket.on('media:createTransport', async ({ conversationId }, callback) => {
    try {
      const transportData = await mediasoupManager.createWebRtcTransport(
        conversationId,
        socket.userId
      );
      callback(transportData);
    } catch (err) {
      console.error('createTransport error:', err);
      callback({ error: err.message });
    }
  });

  // Connect a transport
  socket.on('media:connectTransport', async ({ conversationId, transportId, dtlsParameters }, callback) => {
    try {
      await mediasoupManager.connectTransport(
        conversationId,
        socket.userId,
        transportId,
        dtlsParameters
      );
      callback({ success: true });
    } catch (err) {
      console.error('connectTransport error:', err);
      callback({ error: err.message });
    }
  });

  // Produce (send media track)
  socket.on('media:produce', async ({ conversationId, transportId, kind, rtpParameters, appData }, callback) => {
    try {
      const { id } = await mediasoupManager.produce(
        conversationId,
        socket.userId,
        transportId,
        kind,
        rtpParameters,
        appData
      );

      callback({ id });

      // Notify other peers in the call about the new producer
      socket.to(`call:${conversationId}`).emit('media:newProducer', {
        producerId: id,
        userId: socket.userId,
        kind,
      });
    } catch (err) {
      console.error('produce error:', err);
      callback({ error: err.message });
    }
  });

  // Consume (receive someone's media track)
  socket.on('media:consume', async ({ conversationId, transportId, producerId }, callback) => {
    try {
      const consumerData = await mediasoupManager.consume(
        conversationId,
        socket.userId,
        transportId,
        producerId
      );
      callback(consumerData);
    } catch (err) {
      console.error('consume error:', err);
      callback({ error: err.message });
    }
  });

  // Resume a consumer after client is ready
  socket.on('media:resumeConsumer', async ({ conversationId, consumerId }) => {
    await mediasoupManager.resumeConsumer(conversationId, socket.userId, consumerId);
  });

  // Get list of existing producers in a room (for newly joined peers)
  socket.on('media:getProducers', ({ conversationId }, callback) => {
    const producers = mediasoupManager.getProducers(conversationId, socket.userId);
    callback(producers);
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    // Remove from all rooms
    for (const [roomId] of mediasoupManager.rooms) {
      const peers = mediasoupManager.getPeersInRoom(roomId);
      if (peers.includes(socket.userId)) {
        mediasoupManager.removePeer(roomId, socket.userId);
        socket.to(`call:${roomId}`).emit('media:peerLeft', {
          userId: socket.userId,
        });
      }
    }
  });
};
