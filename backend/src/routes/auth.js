import express from 'express';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import * as authService from '../services/authService.js';
import { queryOne, query } from '../config/database.js';

const router = express.Router();

/**
 * POST /auth/register
 * Creates a new user. Optionally accepts a `referralCode` —
 * if it matches an existing user, the new account is credited as a referral.
 */
router.post('/register', async (req, res) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
    displayName: Joi.string().min(1).max(100).required(),
    referralCode: Joi.string().optional()
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
        const result = await authService.registerUser(
      value.email,
      value.username,
      value.password,
      value.displayName,
      value.referralCode
    );

    const { user, accessToken, refreshToken } = result;

    res.status(201).json({
      user,
      accessToken,
      refreshToken
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Registration failed. Please try again.' });
  }
});

/**
 * POST /auth/login
 */
router.post('/login', async (req, res) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
        const result = await authService.loginWithEmail(value.email, value.password);

    if (result.twofaRequired) {
      return res.json({
        twofaRequired: true,
        challengeToken: result.challengeToken,
        user: result.user
      });
    }

    const { user, accessToken, refreshToken } = result;
    res.json({ user, accessToken, refreshToken });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Database connection failed' });
    }
    res.status(401).json({ error: err.message || 'Login failed. Please try again.' });
  }
});

/**
 * POST /auth/google
 * Exchanges a Google Identity Services ID token (the GIS `credential` JWT)
 * for DUYS JWTs. The credential is verified against Google's tokeninfo
 * endpoint — signature, expiry and issuer are validated by Google, and we
 * additionally require the audience to match GOOGLE_CLIENT_ID and the
 * email to be verified. Never trust raw googleId/email from the client.
 */
router.post('/google', async (req, res) => {
    const schema = Joi.object({
    credential: Joi.string().required(),
    referralCode: Joi.string().optional()
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Google login is not configured on the server' });
  }

  try {
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(value.credential)}`
    );
    if (!tokenInfoRes.ok) {
      return res.status(401).json({ error: 'Invalid Google credential' });
    }
    const info = await tokenInfoRes.json();

    const validIss = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
    if (info.aud !== clientId || !validIss || info.email_verified !== 'true') {
      return res.status(401).json({ error: 'Google credential failed verification' });
    }

        // If a referralCode is provided, look up the referrer
    let referredBy = null;
    if (value.referralCode) {
      const referrer = await queryOne('SELECT id FROM users WHERE username = $1', [value.referralCode]);
      if (referrer) referredBy = referrer.id;
    }

    const result = await authService.loginWithGoogle(
      info.sub,
      info.email,
      info.name || info.email.split('@')[0],
      info.picture,
      referredBy
    );

    if (result.twofaRequired) {
      return res.json({
        twofaRequired: true,
        challengeToken: result.challengeToken,
        user: result.user
      });
    }

    const { user, accessToken, refreshToken } = result;
    res.json({ user, accessToken, refreshToken });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /auth/2fa/challenge
 * Verify a TOTP code against a pending challenge token.
 * The challengeToken comes from /auth/login when twofaRequired was returned.
 */
router.post('/2fa/challenge', async (req, res) => {
  const schema = Joi.object({
    challengeToken: Joi.string().required(),
    code: Joi.string().length(6).required()
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const decoded = jwt.verify(value.challengeToken, process.env.JWT_SECRET || 'dev-secret-key');
    if (!decoded.twofaChallenge || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid challenge token' });
    }

    const user = await queryOne(
      'SELECT id, email, username, is_admin, twofa_secret FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!user || !user.twofa_secret) {
      return res.status(401).json({ error: '2FA not configured for this user' });
    }

    if (!authService.verifyTotp(user.twofa_secret, value.code)) {
      return res.status(401).json({ error: 'Invalid code. Try again.' });
    }

    const accessToken = authService.generateAccessToken(user.id, user.email);
    const refreshToken = authService.generateRefreshToken(user.id);

    await query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.id]);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        is_admin: user.is_admin,
        twofa_enabled: true
      },
      accessToken,
      refreshToken
    });
  } catch (err) {
    res.status(401).json({ error: 'Challenge expired or invalid' });
  }
});

/**
 * POST /auth/refresh
 */
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    // In production, you'd verify the refresh token and issue a new access token
    // For now, this is a placeholder
    res.json({ accessToken: refreshToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

/**
 * POST /auth/logout
 */
router.post('/logout', (req, res) => {
  // Invalidate token on client side, or use token blacklist in Redis
  res.json({ message: 'Logged out successfully' });
});

export default router;
