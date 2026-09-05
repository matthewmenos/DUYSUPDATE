import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne, transaction } from '../config/database.js';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth.js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import * as pointsService from './pointsService.js';
const { getSetting } = pointsService;

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

// Re-export token generators so routes can use authService.generateAccessToken etc.
export { generateAccessToken, generateRefreshToken };

/**
 * Hash password
 */
export async function hashPassword(password) {
  return bcryptjs.hash(password, SALT_ROUNDS);
}

/**
 * Compare password
 */
export async function comparePassword(password, hash) {
  return bcryptjs.compare(password, hash);
}

/**
 * Register user with email/password
 */
export async function registerUser(email, username, password, displayName, referralCode) {
  const passwordHash = await hashPassword(password);

  return transaction(async (client) => {
    // Check if user exists
    const existing = await queryOne(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existing) {
      const emailTaken = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
      throw new Error(emailTaken ? 'An account with this email already exists' : 'That username is already taken');
    }

    // If referral code provided, look up the referrer
    let referredById = null;
    if (referralCode) {
      const referrer = await queryOne('SELECT id FROM users WHERE username = $1', [referralCode]);
      if (referrer) referredById = referrer.id;
    }

    // Create user
    const result = await client.query(
      `INSERT INTO users (email, username, display_name, password_hash, referred_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, username, display_name`,
      [email, username, displayName, passwordHash, referredById]
    );

    const userRow = result.rows[0];

    // If a valid referral was used, record it and credit the referrer's bonus.
    if (referredById) {
      try {
        const bonus = Number(await getSetting('points_referral_bonus', 100));
        await client.query(
          `INSERT INTO referrals (referrer_id, referred_user_id, reward_given)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [referredById, userRow.id, bonus]
        );
        await client.query(
          'UPDATE users SET points = points + $1 WHERE id = $2',
          [bonus, referredById]
        );
        // Ledger entry (point_ledger arrives with the economy migration).
        try {
          await client.query(
            `INSERT INTO point_ledger (user_id, delta, reason, ref) VALUES ($1, $2, 'referral_bonus', $3)`,
            [referredById, bonus, `user:${userRow.id}`]
          );
        } catch {
          /* point_ledger not yet migrated — ignore. */
        }
      } catch {
        /* Referral credit must never break registration. */
      }
    }

    const accessToken = generateAccessToken(userRow.id, userRow.email);
    const refreshToken = generateRefreshToken(userRow.id);

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        username: userRow.username,
        display_name: userRow.display_name,
        is_admin: false,
        twofa_enabled: false
      },
      accessToken,
      refreshToken
    };
  });
}

/**
 * Login with email/password
 */
export async function loginWithEmail(email, password) {
  const user = await queryOne(
    'SELECT id, email, username, password_hash, is_banned, is_admin, twofa_enabled, twofa_secret FROM users WHERE email = $1',
    [email]
  );

  if (!user) {
    throw new Error('Invalid email or password');
  }

  if (user.is_banned) {
    throw new Error('This account has been banned');
  }

  const isValidPassword = await comparePassword(password, user.password_hash);
  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  await query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.id]);

  // If 2FA is enabled, return a challenge token instead of access/refresh
  if (user.twofa_enabled && user.twofa_secret) {
    const challengeToken = jwt.sign(
      { userId: user.id, twofaChallenge: true },
      JWT_SECRET,
      { expiresIn: '5m' }
    );
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        is_admin: user.is_admin,
        twofa_enabled: true
      },
      twofaRequired: true,
      challengeToken
    };
  }

  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      is_admin: user.is_admin,
      twofa_enabled: false
    },
    accessToken,
    refreshToken
  };
}

/**
 * Login with Google OAuth
 */
export async function loginWithGoogle(googleId, email, displayName, avatarUrl, referredBy) {
  let user = await queryOne(
    'SELECT id, email, username, is_banned, is_admin, twofa_enabled, twofa_secret FROM users WHERE google_id = $1',
    [googleId]
  );

  if (!user) {
    // Create new user from Google
    const username = email.split('@')[0] + Math.random().toString(36).substring(7);
        const result = await query(
      `INSERT INTO users (google_id, email, username, display_name, avatar_url, is_admin, referred_by)
       VALUES ($1, $2, $3, $4, $5, false, $6)
       RETURNING id, email, username, is_admin, twofa_enabled, twofa_secret`,
      [googleId, email, username, displayName, avatarUrl, referredBy]
    );
    user = result.rows[0];
  }

  if (user.is_banned) {
    throw new Error('This account has been banned');
  }

  await query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.id]);

  // If 2FA is enabled, return a challenge token instead of access/refresh
  if (user.twofa_enabled && user.twofa_secret) {
    const challengeToken = jwt.sign(
      { userId: user.id, twofaChallenge: true },
      JWT_SECRET,
      { expiresIn: '5m' }
    );
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        is_admin: user.is_admin,
        twofa_enabled: true
      },
      twofaRequired: true,
      challengeToken
    };
  }

  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      is_admin: user.is_admin,
      twofa_enabled: false
    },
    accessToken,
    refreshToken
  };
}

/**
 * Generate a TOTP secret for 2FA setup
 */
export function generateTotpSecret() {
  return authenticator.generateSecret();
}

/**
 * Generate a TOTP provisioning URI (for QR code)
 */
export function provisioningUri(secret, email) {
  return authenticator.keyuri(email, 'DUYS', secret);
}

/**
 * Generate a QR code data URI from a provisioning URI
 */
export async function qrDataUri(uri) {
  return QRCode.toDataURL(uri);
}

/**
 * Verify a TOTP code against a secret (window=1 for clock drift)
 */
export function verifyTotp(secret, code) {
  if (!secret || !code) return false;
  return authenticator.check(code, secret);
}

/**
 * Enable 2FA for a user
 */
export async function enableTwoFactor(userId, secret) {
  await query(
    'UPDATE users SET twofa_secret = $1, twofa_enabled = true WHERE id = $2',
    [secret, userId]
  );
}

/**
 * Disable 2FA for a user
 */
export async function disableTwoFactor(userId) {
  await query(
    'UPDATE users SET twofa_secret = \'\', twofa_enabled = false WHERE id = $1',
    [userId]
  );
}

export default {
  hashPassword,
  comparePassword,
  registerUser,
  loginWithEmail,
  loginWithGoogle
};
