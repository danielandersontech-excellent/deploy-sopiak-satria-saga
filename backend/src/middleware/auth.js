/**
 * AUTH MIDDLEWARE - JWT Token verification + Refresh Token
 * PTSSS v8 - Hardened security
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { queryOne, query } = require('../config/database');

// SECURITY: No fallback secret - MUST be set in .env
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('\n❌ FATAL: JWT_SECRET belum di-set atau terlalu pendek (min 32 karakter)!');
  console.error('   Generate: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  console.error('   Lalu set di backend/.env\n');
  process.exit(1);
}
if (JWT_SECRET.includes('GANTI') || JWT_SECRET.includes('ganti-ini')) {
  console.warn('\n⚠️  WARNING: JWT_SECRET masih placeholder! Segera ganti untuk production.');
  console.warn('   Generate: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n');
}

// Generate JWT access token (short-lived)
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, nrp: user.nrp, role: user.role, nama: user.nama },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30m' }
  );
};

// Generate refresh token (long-lived, stored in DB)
const generateRefreshToken = async (userId) => {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Delete old refresh tokens for this user (token rotation)
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

  // Store new refresh token
  await query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt]
  );

  return token;
};

// Verify refresh token from DB
const verifyRefreshToken = async (token) => {
  const row = await queryOne(
    'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
    [token]
  );
  return row;
};

// Revoke refresh token
const revokeRefreshToken = async (userId) => {
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
};

// Verify JWT token - required for all protected routes
const auth = async (req, res, next) => {
  try {
    // Try Authorization header first, then httpOnly cookie
    const header = req.headers.authorization;
    let token = null;
    if (header && header.startsWith('Bearer ')) {
      token = header.split(' ')[1];
    } else if (req.cookies?.ptsss_token) {
      token = req.cookies.ptsss_token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Token tidak ditemukan' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);

    // Handle klien (client) tokens
    if (decoded.role === 'klien' && decoded.client_id) {
      req.user = {
        id: decoded.id,
        nrp: decoded.nrp,
        nama: decoded.nama,
        role: 'klien',
        client_id: decoded.client_id,
      };
      return next();
    }

    // Fetch fresh user data from DB
    const user = await queryOne(
      'SELECT id, nrp, nama, role, lokasi_id, pos_jaga_id, status, shift FROM users WHERE id = $1',
      [decoded.id]
    );
    if (!user) return res.status(401).json({ error: 'User tidak ditemukan' });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    if (err.name === 'JsonWebTokenError')
      return res.status(401).json({ error: 'Token tidak valid' });
    return res.status(500).json({ error: 'Auth error' });
  }
};

// Role-based access - only allow specific roles
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Belum login' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Akses ditolak. Anda tidak memiliki izin.' });
    }
    next();
  };
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  auth,
  requireRole,
};
