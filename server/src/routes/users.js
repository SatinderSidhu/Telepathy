const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

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

module.exports = router;
