const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { hashPassword, comparePassword, generateTokens } = require('../utils/auth');

/**
 * B1. Resident User Login
 * POST /api/users/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userRes = await query(
      `SELECT u.*, s.society_name 
       FROM users u 
       LEFT JOIN societies s ON u.society_id = s.society_id 
       WHERE LOWER(u.email) = LOWER(?)`,
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email address or password' });
    }

    const user = userRes.rows[0];
    const matchRes = await comparePassword(password, user.password_hash);
    if (!matchRes.matches) {
      return res.status(401).json({ error: 'Invalid email address or password' });
    }

    const tokenPayload = { id: user.user_id, role: 'user', email: user.email };
    const tokens = generateTokens(tokenPayload, 'user');

    res.status(200).json({
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        user_id: String(user.user_id),
        name: user.name,
        email: user.email,
        phone: user.phone,
        society_id: user.society_id ? String(user.society_id) : '1',
        society_name: user.society_name || 'Omaxe Greenwood Residency',
        flat: user.flat || 'Tower A-402',
        joined_date: user.joined_date || 'August 2026',
        avatar: user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
      }
    });
  } catch (err) {
    console.error('Error during resident user login:', err);
    res.status(500).json({ error: 'User login failed due to a server error' });
  }
});

/**
 * B2. Resident User Registration
 * POST /api/users/register
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, society_id, flat } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Missing required registration fields' });
    }

    const existing = await query(`SELECT user_id FROM users WHERE LOWER(email) = LOWER(?)`, [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email address already exists' });
    }

    const userId = `usr_${Date.now().toString().slice(-6)}`;
    const pwdHash = await hashPassword(password);
    const socId = society_id ? parseInt(society_id, 10) : 1;

    await query(
      `INSERT INTO users (user_id, name, email, phone, password_hash, society_id, flat, joined_date, avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'August 2026', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200')`,
      [userId, name, email, phone, pwdHash, socId, flat || 'Tower A-402']
    );

    const socRes = await query(`SELECT society_name FROM societies WHERE society_id = ?`, [socId]);
    const societyName = socRes.rows[0]?.society_name || 'Omaxe Greenwood Residency';

    const tokens = generateTokens({ id: userId, role: 'user', email }, 'user');

    res.status(201).json({
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        user_id: userId,
        name,
        email,
        phone,
        society_id: String(socId),
        society_name: societyName,
        flat: flat || 'Tower A-402'
      }
    });
  } catch (err) {
    console.error('Error during resident user registration:', err);
    res.status(500).json({ error: 'User registration failed due to a server error' });
  }
});

module.exports = router;
