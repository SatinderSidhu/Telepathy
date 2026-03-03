const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// Get all conversations for the current user
router.get('/conversations', async (req, res) => {
  try {
    const conversations = await db('conversations')
      .join('conversation_members', 'conversations.id', 'conversation_members.conversation_id')
      .where('conversation_members.user_id', req.user.id)
      .select('conversations.*')
      .orderBy('conversations.created_at', 'desc');

    // Attach members and last message to each conversation
    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const members = await db('conversation_members')
          .join('users', 'users.id', 'conversation_members.user_id')
          .where('conversation_members.conversation_id', conv.id)
          .select('users.id', 'users.username', 'users.avatar_url');

        const lastMessage = await db('messages')
          .where('conversation_id', conv.id)
          .orderBy('created_at', 'desc')
          .select('id', 'content', 'type', 'sender_id', 'created_at')
          .first();

        return { ...conv, members, lastMessage: lastMessage || null };
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a conversation (direct or group)
router.post('/conversations', async (req, res) => {
  try {
    const { type, name, memberIds } = req.body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'At least one member is required' });
    }

    // For direct chats, check if one already exists between the two users
    if (type === 'direct' && memberIds.length === 1) {
      const existing = await db('conversations')
        .where('type', 'direct')
        .whereIn('id', function () {
          this.select('conversation_id')
            .from('conversation_members')
            .where('user_id', req.user.id);
        })
        .whereIn('id', function () {
          this.select('conversation_id')
            .from('conversation_members')
            .where('user_id', memberIds[0]);
        })
        .first();

      if (existing) {
        const members = await db('conversation_members')
          .join('users', 'users.id', 'conversation_members.user_id')
          .where('conversation_members.conversation_id', existing.id)
          .select('users.id', 'users.username', 'users.avatar_url');
        return res.json({ ...existing, members });
      }
    }

    const [conversation] = await db('conversations')
      .insert({
        type: type || 'direct',
        name: type === 'group' ? name : null,
        created_by: req.user.id,
      })
      .returning('*');

    // Add all members including the creator
    const allMembers = [...new Set([req.user.id, ...memberIds])];
    await db('conversation_members').insert(
      allMembers.map((userId) => ({
        conversation_id: conversation.id,
        user_id: userId,
      }))
    );

    const members = await db('conversation_members')
      .join('users', 'users.id', 'conversation_members.user_id')
      .where('conversation_members.conversation_id', conversation.id)
      .select('users.id', 'users.username', 'users.avatar_url');

    res.status(201).json({ ...conversation, members });
  } catch (err) {
    console.error('Create conversation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages for a conversation
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, before } = req.query;

    // Verify the user is a member
    const isMember = await db('conversation_members')
      .where({ conversation_id: id, user_id: req.user.id })
      .first();
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    let query = db('messages')
      .join('users', 'users.id', 'messages.sender_id')
      .where('messages.conversation_id', id)
      .select(
        'messages.id',
        'messages.content',
        'messages.type',
        'messages.file_url',
        'messages.read_by',
        'messages.created_at',
        'users.id as sender_id',
        'users.username as sender_username',
        'users.avatar_url as sender_avatar'
      )
      .orderBy('messages.created_at', 'desc')
      .limit(Math.min(parseInt(limit), 100));

    if (before) {
      query = query.where('messages.created_at', '<', before);
    }

    const messages = await query;

    // Filter out deleted messages for this user
    const filtered = messages.filter(msg => {
      // If deleted for everyone, hide from all users
      if (msg.deleted_for_everyone) return false;

      // If deleted for specific users, hide from those users
      if (msg.deleted_for) {
        try {
          const deletedFor = typeof msg.deleted_for === 'string'
            ? JSON.parse(msg.deleted_for)
            : msg.deleted_for;
          if (Array.isArray(deletedFor) && deletedFor.includes(req.user.id)) {
            return false;
          }
        } catch (e) {
          console.error('Error parsing deleted_for:', e);
        }
      }

      return true;
    });

    res.json(filtered.reverse());
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete message
router.delete('/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { deleteFor } = req.query; // 'me' or 'everyone'

    // Check if message exists and user is the sender
    const message = await db('messages').where({ id: messageId }).first();

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (deleteFor === 'everyone') {
      // Only sender can delete for everyone
      if (message.sender_id !== req.user.id) {
        return res.status(403).json({ error: 'Only sender can delete for everyone' });
      }

      await db('messages')
        .where({ id: messageId })
        .update({
          deleted_for_everyone: true,
          updated_at: new Date()
        });

      res.json({ message: 'Message deleted for everyone', deleteFor: 'everyone' });
    } else {
      // Delete for me only
      const deletedFor = message.deleted_for || [];

      if (!deletedFor.includes(req.user.id)) {
        deletedFor.push(req.user.id);

        await db('messages')
          .where({ id: messageId })
          .update({
            deleted_for: JSON.stringify(deletedFor),
            updated_at: new Date()
          });
      }

      res.json({ message: 'Message deleted for you', deleteFor: 'me' });
    }
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
