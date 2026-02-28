const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { generateTokens, authenticate } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await db('users')
      .where({ email })
      .orWhere({ username })
      .first();
    if (existing) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const [user] = await db('users')
      .insert({ username, email, password_hash })
      .returning(['id', 'username', 'email', 'avatar_url', 'created_at']);

    const tokens = generateTokens(user);
    res.status(201).json({ user, ...tokens });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db('users').where({ email }).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokens = generateTokens(user);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, ...tokens });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await db('users')
      .where({ id: decoded.id })
      .select('id', 'username', 'email')
      .first();

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const tokens = generateTokens(user);
    res.json(tokens);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.user.id })
      .select('id', 'username', 'email', 'avatar_url', 'status', 'created_at')
      .first();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
