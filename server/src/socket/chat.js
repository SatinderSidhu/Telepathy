const db = require('../config/db');

module.exports = function registerChatHandlers(io, socket) {
  // Join conversation rooms
  socket.on('chat:join', async (conversationId) => {
    try {
      const isMember = await db('conversation_members')
        .where({ conversation_id: conversationId, user_id: socket.userId })
        .first();

      if (isMember) {
        socket.join(conversationId);
        socket.emit('chat:joined', conversationId);
      }
    } catch (err) {
      console.error('Join room error:', err);
    }
  });

  // Leave conversation room
  socket.on('chat:leave', (conversationId) => {
    socket.leave(conversationId);
  });

  // Send a message
  socket.on('chat:message', async (data) => {
    try {
      const { conversationId, content, type = 'text' } = data;

      const isMember = await db('conversation_members')
        .where({ conversation_id: conversationId, user_id: socket.userId })
        .first();
      if (!isMember) return;

      const [message] = await db('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: socket.userId,
          content,
          type,
        })
        .returning('*');

      const user = await db('users')
        .where({ id: socket.userId })
        .select('id', 'username', 'avatar_url')
        .first();

      const fullMessage = {
        ...message,
        sender_id: user.id,
        sender_username: user.username,
        sender_avatar: user.avatar_url,
      };

      io.to(conversationId).emit('chat:message', fullMessage);
    } catch (err) {
      console.error('Send message error:', err);
    }
  });

  // Typing indicator
  socket.on('chat:typing', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('chat:typing', {
      conversationId,
      userId: socket.userId,
      username: socket.username,
    });
  });

  // Stop typing
  socket.on('chat:stopTyping', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('chat:stopTyping', {
      conversationId,
      userId: socket.userId,
    });
  });

  // Mark messages as read
  socket.on('chat:markRead', async (data) => {
    try {
      const { conversationId, messageIds } = data;

      for (const msgId of messageIds) {
        await db('messages')
          .where({ id: msgId, conversation_id: conversationId })
          .update({
            read_by: db.raw(`read_by || '"${socket.userId}"'::jsonb`),
          });
      }

      socket.to(conversationId).emit('chat:read', {
        conversationId,
        userId: socket.userId,
        messageIds,
      });
    } catch (err) {
      console.error('Mark read error:', err);
    }
  });

  // Delete message
  socket.on('chat:deleteMessage', async (data) => {
    try {
      const { messageId, deleteFor, conversationId } = data;

      const message = await db('messages').where({ id: messageId }).first();

      if (!message) {
        return socket.emit('error', { message: 'Message not found' });
      }

      if (deleteFor === 'everyone') {
        // Only sender can delete for everyone
        if (message.sender_id !== socket.userId) {
          return socket.emit('error', { message: 'Only sender can delete for everyone' });
        }

        await db('messages')
          .where({ id: messageId })
          .update({
            deleted_for_everyone: true,
            updated_at: new Date()
          });

        // Notify all users in the conversation
        io.to(conversationId).emit('chat:messageDeleted', {
          messageId,
          deleteFor: 'everyone',
          conversationId
        });
      } else {
        // Delete for me only
        const deletedFor = message.deleted_for || [];
        const deletedArray = typeof deletedFor === 'string'
          ? JSON.parse(deletedFor)
          : deletedFor;

        if (!deletedArray.includes(socket.userId)) {
          deletedArray.push(socket.userId);

          await db('messages')
            .where({ id: messageId })
            .update({
              deleted_for: JSON.stringify(deletedArray),
              updated_at: new Date()
            });
        }

        // Only notify the user who deleted it
        socket.emit('chat:messageDeleted', {
          messageId,
          deleteFor: 'me',
          conversationId
        });
      }
    } catch (err) {
      console.error('Delete message error:', err);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  // Profile update notification
  socket.on('profile:updated', async (data) => {
    try {
      const { userId, avatar_url, username } = data;

      // Notify all conversations where this user is a member
      const conversations = await db('conversation_members')
        .where({ user_id: userId })
        .select('conversation_id');

      conversations.forEach(conv => {
        io.to(conv.conversation_id).emit('user:profileUpdated', {
          userId,
          avatar_url,
          username
        });
      });
    } catch (err) {
      console.error('Profile update notification error:', err);
    }
  });
};
