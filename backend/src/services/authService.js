import bcryptjs from 'bcryptjs';
import { query, queryOne, transaction } from '../config/database.js';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth.js';

const SALT_ROUNDS = 10;

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
export async function registerUser(email, username, password, displayName) {
  const passwordHash = await hashPassword(password);

  return transaction(async (client) => {
    // Check if user exists
    const existing = await queryOne(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existing) {
      throw new Error('Email or username already exists');
    }

    // Create user
    const result = await client.query(
      `INSERT INTO users (email, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, username, display_name`,
      [email, username, displayName, passwordHash]
    );

    const user = result.rows[0];
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);

    return { user, accessToken, refreshToken };
  });
}

/**
 * Login with email/password
 */
export async function loginWithEmail(email, password) {
  const user = await queryOne(
    'SELECT id, email, username, password_hash, is_banned FROM users WHERE email = $1',
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

  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id);

  // Update last_seen
  await query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.id]);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username
    },
    accessToken,
    refreshToken
  };
}

/**
 * Login with Google OAuth
 */
export async function loginWithGoogle(googleId, email, displayName, avatarUrl) {
  let user = await queryOne(
    'SELECT id, email, username, is_banned FROM users WHERE google_id = $1',
    [googleId]
  );

  if (!user) {
    // Create new user
    const username = email.split('@')[0] + Math.random().toString(36).substring(7);
    const result = await query(
      `INSERT INTO users (google_id, email, username, display_name, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, username`,
      [googleId, email, username, displayName, avatarUrl]
    );
    user = result.rows[0];
  }

  if (user.is_banned) {
    throw new Error('This account has been banned');
  }

  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id);

  // Update last_seen
  await query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.id]);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username
    },
    accessToken,
    refreshToken
  };
}

export default {
  hashPassword,
  comparePassword,
  registerUser,
  loginWithEmail,
  loginWithGoogle
};
