import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

/**
 * Generate JWT access token
 */
export function generateAccessToken(userId, email) {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
}

/**
 * Generate JWT refresh token
 */
export function generateRefreshToken(userId) {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '90d' }
  );
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Authenticate JWT middleware
 */
export function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;

  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  req.userId = decoded.userId;
  next();
}

/**
 * Admin check middleware
 */
export async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { queryOne } = await import('./database.js');
  const user = await queryOne('SELECT is_admin FROM users WHERE id = $1', [req.userId]);

  if (!user || !user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  authenticateJWT,
  requireAdmin,
};
