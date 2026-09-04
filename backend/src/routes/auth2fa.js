/**
 * Auth routes for 2FA setup and app-level config.
 * Mounts under /auth in app.js.
 */
import express from 'express';
import { queryAll } from '../config/database.js';
import { authenticateJWT } from '../middleware/auth.js';
import * as authService from '../services/authService.js';

const router = express.Router();

/**
 * GET /auth/config
 * Public — returns app-level config for auth pages (Google enabled, announcement).
 */
router.get('/config', async (req, res) => {
  try {
    const configRows = await queryAll(
      "SELECT key, value FROM app_config WHERE key IN ('google_enabled', 'announcement_enabled', 'announcement_text')"
    );
    const cfg = {};
    configRows.forEach(r => { cfg[r.key] = r.value; });

    res.json({
      googleEnabled: cfg.google_enabled === 'true',
      announcementEnabled: cfg.announcement_enabled === 'true',
      announcementText: cfg.announcement_text || '',
    });
  } catch (err) {
    res.json({
      googleEnabled: process.env.GOOGLE_CLIENT_ID ? true : false,
      announcementEnabled: false,
      announcementText: '',
    });
  }
});

/**
 * POST /auth/2fa/setup
 * Authenticated — generates a TOTP secret + QR code for the current user.
 */
router.post('/2fa/setup', authenticateJWT, async (req, res) => {
  try {
    const secret = authService.generateTotpSecret();
    const uri = authService.provisioningUri(secret, req.user.email);
    const qr = await authService.qrDataUri(uri);

    res.json({ secret, uri, qr });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate 2FA secret' });
  }
});

/**
 * POST /auth/2fa/enable
 * Authenticated — confirms the TOTP code and enables 2FA for the user.
 */
router.post('/2fa/enable', authenticateJWT, async (req, res) => {
  const { secret, code } = req.body;
  if (!secret || !code) {
    return res.status(400).json({ error: 'Secret and code are required' });
  }

  try {
    if (!authService.verifyTotp(secret, code)) {
      return res.status(400).json({ error: 'Invalid code. Try again.' });
    }

    await authService.enableTwoFactor(req.userId, secret);
    res.json({ message: 'Two-factor authentication enabled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

/**
 * POST /auth/2fa/disable
 * Authenticated — disables 2FA for the current user.
 */
router.post('/2fa/disable', authenticateJWT, async (req, res) => {
  try {
    await authService.disableTwoFactor(req.userId);
    res.json({ message: 'Two-factor authentication disabled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

export default router;

