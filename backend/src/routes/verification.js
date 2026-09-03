import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, queryAll } from '../config/database.js';
import { uploadVerification, deleteVerification } from '../services/storage.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /verify/email/send
 * Send email verification code
 */
router.post('/email/send', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Check if user exists
    const user = await queryOne(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate verification code (6 digits)
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store code (should be sent via email in production)
    await query(
      `INSERT INTO verifications (user_id, type, identifier, verification_code, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (user_id, type) DO UPDATE SET
         verification_code = $4,
         expires_at = NOW() + INTERVAL '10 minutes',
         updated_at = NOW()`,
      [user.id, 'email', email, verificationCode]
    );

    // TODO: Send email with verification code via SMTP
    res.json({
      message: 'Verification code sent to email',
      verificationCode // Remove in production
    });
  } catch (error) {
    console.error('[Email Verification]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /verify/email/verify
 * Confirm email verification with code
 */
router.post('/email/verify', async (req, res) => {
  try {
    const { email, verificationCode } = req.body;
    if (!email || !verificationCode) {
      return res.status(400).json({ error: 'Email and verification code required' });
    }

    const verification = await queryOne(
      `SELECT * FROM verifications 
       WHERE type = $1 AND identifier = $2 AND expires_at > NOW()`,
      ['email', email]
    );

    if (!verification || verification.verification_code !== verificationCode) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    // Mark as verified
    await query(
      `UPDATE verifications 
       SET is_verified = true, verified_at = NOW() 
       WHERE id = $1`,
      [verification.id]
    );

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('[Email Confirmation]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /verify/phone/send
 * Send phone verification code (SMS)
 */
router.post('/phone/send', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    // Check if user exists
    const user = await queryOne(
      'SELECT id FROM users WHERE phone = $1 OR $1 LIKE concat(\'%\', phone)',
      [phone]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    await query(
      `INSERT INTO verifications (user_id, type, identifier, verification_code, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (user_id, type) DO UPDATE SET
         verification_code = $4,
         expires_at = NOW() + INTERVAL '10 minutes',
         updated_at = NOW()`,
      [user.id, 'phone', phone, verificationCode]
    );

    // TODO: Send SMS with verification code
    res.json({
      message: 'Verification code sent via SMS',
      verificationCode // Remove in production
    });
  } catch (error) {
    console.error('[Phone Verification]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /verify/phone/verify
 * Confirm phone verification with code
 */
router.post('/phone/verify', async (req, res) => {
  try {
    const { phone, verificationCode } = req.body;
    if (!phone || !verificationCode) {
      return res.status(400).json({ error: 'Phone and verification code required' });
    }

    const verification = await queryOne(
      `SELECT * FROM verifications 
       WHERE type = $1 AND identifier LIKE concat('%', $2) AND expires_at > NOW()`,
      ['phone', phone]
    );

    if (!verification || verification.verification_code !== verificationCode) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    await query(
      `UPDATE verifications 
       SET is_verified = true, verified_at = NOW() 
       WHERE id = $1`,
      [verification.id]
    );

    res.json({ message: 'Phone verified successfully' });
  } catch (error) {
    console.error('[Phone Confirmation]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /verify/face
 * Upload face photo for verification (stored in private R2 bucket)
 */
router.post('/face', authenticateJWT, upload.single('face'), async (req, res) => {
  try {
    const userId = req.userId;

    if (!req.file) {
      return res.status(400).json({ error: 'Face image required' });
    }

    // Validate image type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, WebP allowed' });
    }

    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must be < 5MB' });
    }

    const verificationId = uuidv4();
    const key = `verifications/${userId}/face/${verificationId}.jpg`;

    // Upload to private R2 bucket
    await uploadVerification(key, req.file.buffer, req.file.mimetype);

    // Store verification record
    await query(
      `INSERT INTO verifications (user_id, type, verification_data, is_verified)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, type) DO UPDATE SET
         verification_data = $3,
         updated_at = NOW(),
         is_verified = false`,
      [userId, 'face', JSON.stringify({ file_key: key, uploaded_at: new Date() }), false]
    );

    res.json({
      message: 'Face verification uploaded successfully',
      verificationId,
      status: 'pending_review'
    });
  } catch (error) {
    console.error('[Face Verification Upload]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /verify/id
 * Upload ID document for verification (stored in private R2 bucket)
 */
router.post('/id', authenticateJWT, upload.single('idDocument'), async (req, res) => {
  try {
    const userId = req.userId;

    if (!req.file) {
      return res.status(400).json({ error: 'ID document required' });
    }

    // Validate file type
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, PDF allowed' });
    }

    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size must be < 10MB' });
    }

    const verificationId = uuidv4();
    const ext = req.file.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
    const key = `verifications/${userId}/id/${verificationId}.${ext}`;

    // Upload to private R2 bucket
    await uploadVerification(key, req.file.buffer, req.file.mimetype);

    // Store verification record
    await query(
      `INSERT INTO verifications (user_id, type, verification_data, is_verified)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, type) DO UPDATE SET
         verification_data = $3,
         updated_at = NOW(),
         is_verified = false`,
      [userId, 'id', JSON.stringify({ file_key: key, uploaded_at: new Date() }), false]
    );

    res.json({
      message: 'ID verification uploaded successfully',
      verificationId,
      status: 'pending_review'
    });
  } catch (error) {
    console.error('[ID Verification Upload]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /verify/status
 * Get all user verifications status
 */
router.get('/status', authenticateJWT, async (req, res) => {
  try {
    const userId = req.userId;

    const verifications = await queryAll(
      `SELECT type, is_verified, verified_at, created_at, expires_at
       FROM verifications 
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      verifications: verifications.map(v => ({
        type: v.type,
        isVerified: v.is_verified,
        verifiedAt: v.verified_at,
        createdAt: v.created_at,
        expiresAt: v.expires_at
      }))
    });
  } catch (error) {
    console.error('[List Verifications]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
