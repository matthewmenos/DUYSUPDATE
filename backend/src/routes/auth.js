import express from 'express';
import Joi from 'joi';
import * as authService from '../services/authService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * POST /auth/register
 */
router.post('/register', async (req, res) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
    displayName: Joi.string().min(1).max(100).required()
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const { user, accessToken, refreshToken } = await authService.registerUser(
      value.email,
      value.username,
      value.password,
      value.displayName
    );

    res.status(201).json({
      user,
      accessToken,
      refreshToken
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
    const { user, accessToken, refreshToken } = await authService.loginWithEmail(
      value.email,
      value.password
    );

    res.json({
      user,
      accessToken,
      refreshToken
    });
  } catch (err) {
    res.status(401).json({ error: err.message });
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
    credential: Joi.string().required()
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

    const { user, accessToken, refreshToken } = await authService.loginWithGoogle(
      info.sub,
      info.email,
      info.name || info.email.split('@')[0],
      info.picture
    );

    res.json({ user, accessToken, refreshToken });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
