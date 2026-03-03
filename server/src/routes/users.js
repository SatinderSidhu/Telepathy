const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/avatars');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const router = express.Router();

// Store io instance
let io;
router.setIO = (ioInstance) => {
  io = ioInstance;
};

router.use(authenticate);

// Search users
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const users = await db('users')
      .where('username', 'ilike', `%${q}%`)
      .andWhereNot('id', req.user.id)
      .select('id', 'username', 'avatar_url', 'status')
      .limit(20);

    res.json(users);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get contacts
router.get('/contacts', async (req, res) => {
  try {
    const contacts = await db('contacts')
      .join('users', 'users.id', 'contacts.contact_id')
      .where('contacts.user_id', req.user.id)
      .where('contacts.status', 'accepted')
      .select('users.id', 'users.username', 'users.avatar_url', 'users.status');

    res.json(contacts);
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send contact request
router.post('/contacts/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    if (contactId === req.user.id) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }

    const existing = await db('contacts')
      .where({ user_id: req.user.id, contact_id: contactId })
      .first();
    if (existing) {
      return res.status(409).json({ error: 'Contact request already exists' });
    }

    await db('contacts').insert({ user_id: req.user.id, contact_id: contactId });
    res.status(201).json({ message: 'Contact request sent' });
  } catch (err) {
    console.error('Add contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept/block contact request
router.patch('/contacts/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { status } = req.body;

    if (!['accepted', 'blocked'].includes(status)) {
      return res.status(400).json({ error: 'Status must be accepted or blocked' });
    }

    await db('contacts')
      .where({ user_id: contactId, contact_id: req.user.id })
      .update({ status });

    // If accepted, create the reverse contact entry
    if (status === 'accepted') {
      await db('contacts')
        .insert({ user_id: req.user.id, contact_id: contactId, status: 'accepted' })
        .onConflict(['user_id', 'contact_id'])
        .merge({ status: 'accepted' });
    }

    res.json({ message: `Contact ${status}` });
  } catch (err) {
    console.error('Update contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get pending requests
router.get('/contacts/pending', async (req, res) => {
  try {
    const pending = await db('contacts')
      .join('users', 'users.id', 'contacts.user_id')
      .where('contacts.contact_id', req.user.id)
      .where('contacts.status', 'pending')
      .select('users.id', 'users.username', 'users.avatar_url', 'contacts.created_at');

    res.json(pending);
  } catch (err) {
    console.error('Get pending error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile picture
router.post('/profile/avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Delete old avatar if exists
    const user = await db('users').where({ id: req.user.id }).first();
    if (user.avatar_url) {
      const oldPath = path.join(__dirname, '../..', user.avatar_url);
      try {
        await fs.unlink(oldPath);
      } catch (err) {
        // Ignore if file doesn't exist
      }
    }

    // Update user with new avatar
    const avatar_url = `/uploads/avatars/${req.file.filename}`;
    await db('users')
      .where({ id: req.user.id })
      .update({ avatar_url, updated_at: new Date() });

    // Notify all conversations about profile update
    if (io) {
      const conversations = await db('conversation_members')
        .where({ user_id: req.user.id })
        .select('conversation_id');

      const updatedUser = await db('users')
        .where({ id: req.user.id })
        .select('username')
        .first();

      conversations.forEach(conv => {
        io.to(conv.conversation_id).emit('user:profileUpdated', {
          userId: req.user.id,
          avatar_url,
          username: updatedUser.username
        });
      });
    }

    res.json({ avatar_url });
  } catch (err) {
    console.error('Upload avatar error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password
router.post('/profile/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Verify current password
    const user = await db('users').where({ id: req.user.id }).first();
    const valid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash and update new password
    const password_hash = await bcrypt.hash(newPassword, 12);
    await db('users')
      .where({ id: req.user.id })
      .update({ password_hash, updated_at: new Date() });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile (username, status)
router.patch('/profile', async (req, res) => {
  try {
    const { username, status } = req.body;
    const updates = { updated_at: new Date() };

    if (username) {
      if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
      }
      // Check if username is taken
      const existing = await db('users')
        .where({ username })
        .whereNot({ id: req.user.id })
        .first();
      if (existing) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      updates.username = username;
    }

    if (status !== undefined) {
      updates.status = status;
    }

    await db('users').where({ id: req.user.id }).update(updates);

    const updatedUser = await db('users')
      .where({ id: req.user.id })
      .select('id', 'username', 'email', 'avatar_url', 'status')
      .first();

    // Notify all conversations about profile update (only if username changed)
    if (io && username) {
      const conversations = await db('conversation_members')
        .where({ user_id: req.user.id })
        .select('conversation_id');

      conversations.forEach(conv => {
        io.to(conv.conversation_id).emit('user:profileUpdated', {
          userId: updatedUser.id,
          avatar_url: updatedUser.avatar_url,
          username: updatedUser.username
        });
      });
    }

    res.json(updatedUser);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
