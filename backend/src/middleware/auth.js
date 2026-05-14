/**
 * AUTH MIDDLEWARE - JWT Token verification + Refresh Token
 * PTSSS v8 - Hardened security
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { queryOne, query, pool } = require('../config/database');

// SECURITY: No fallback secret - MUST be set in .env
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('\n❌ FATAL: JWT_SECRET belum di-set atau terlalu pendek (min 32 karakter)!');
  console.error('   Generate: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  console.error('   Lalu set di backend/.env\n');
  process.exit(1);
}
// P1-10: previously this only warned (and only matched 'GANTI' / 'ganti-ini').
// A warning in startup logs is easy to miss — a placeholder secret shipped
// to production is an immediate cryptographic compromise of every token
// the backend ever issues. Treat it as fatal, same severity as a missing
// secret. Regex broadened to catch common placeholder patterns we've seen
// in template repos and .env.example files: 'GANTI', 'ganti-ini', 'REPLACE',
// 'example', 'changeme' / 'change-me' / 'change_me'.
if (/GANTI|ganti-ini|REPLACE|example|change.?me/i.test(JWT_SECRET)) {
  console.error('\n❌ FATAL: JWT_SECRET masih placeholder! Backend menolak start.');
  console.error('   Detected placeholder pattern in JWT_SECRET value.');
  console.error('   Generate: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  console.error('   Lalu set di backend/.env (TANPA kata GANTI / REPLACE / example / changeme).\n');
  process.exit(1);
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

// P1-2: Klien (client) accounts now get refresh tokens too. The
// refresh_tokens table already has both user_id and client_id columns —
// we just had no code-path writing client_id. Without this, a klien
// session would silently expire after the 30-minute access token TTL
// because the mobile/web client had nothing to refresh against.
const generateRefreshTokenForClient = async (clientId) => {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Token rotation scoped to this client: wipe any prior refresh
  // tokens for this client_id before inserting the new one.
  await query('DELETE FROM refresh_tokens WHERE client_id = $1', [clientId]);

  await query(
    'INSERT INTO refresh_tokens (client_id, token, expires_at) VALUES ($1, $2, $3)',
    [clientId, token, expiresAt]
  );

  return token;
};

// P1-3: Atomic refresh-token rotation.
//
// Before this helper, the refresh flow was:
//   1. verifyRefreshToken(token)   -- SELECT
//   2. generateRefreshToken(uid)   -- DELETE WHERE user_id; INSERT
//
// Two parallel requests carrying the same refresh token could both read
// the SELECT, both pass verification, both DELETE all of the user's
// tokens, and both INSERT — the loser's token would silently overwrite
// the winner's. Worse, an attacker who stole a refresh token could keep
// refreshing forever as long as their parallel request raced the
// legitimate one. The classic detection signal for stolen-and-rotated
// tokens (the legitimate client presenting a token that's been used)
// was lost in the race.
//
// rotateRefreshToken() collapses verify + delete + insert into a single
// transaction with `DELETE ... RETURNING`. If RETURNING produces zero
// rows the token did not exist (or was already consumed by a previous
// rotation), the transaction rolls back and we throw "Token sudah
// dipakai". The DELETE acts as a row-level lock guard: even with two
// concurrent BEGIN ... DELETE statements, Postgres serializes them and
// the second one finds nothing to delete.
//
// Returns { subjectType: 'user' | 'client', subjectId, newToken } so
// callers can decide whether to look up a `users` row or a `clients` row
// for the response payload.
const rotateRefreshToken = async (oldToken) => {
  const newToken = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomic check-and-consume of the presented token. The RETURNING
    // clause is the source of truth: if it returns no rows, no other
    // statement in this transaction can see the row either.
    const del = await client.query(
      `DELETE FROM refresh_tokens
        WHERE token = $1
          AND expires_at > NOW()
      RETURNING user_id, client_id`,
      [oldToken]
    );

    if (del.rowCount === 0) {
      await client.query('ROLLBACK');
      const err = new Error('Token sudah dipakai atau tidak valid');
      err.code = 'REFRESH_TOKEN_REUSED';
      throw err;
    }

    const { user_id, client_id } = del.rows[0];

    // Insert the replacement token in the same transaction. If this
    // INSERT fails, the DELETE rolls back too — the user keeps their
    // valid token rather than ending up locked out.
    await client.query(
      `INSERT INTO refresh_tokens (user_id, client_id, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user_id || null, client_id || null, newToken, expiresAt]
    );

    await client.query('COMMIT');

    return {
      subjectType: user_id ? 'user' : 'client',
      subjectId: user_id || client_id,
      newToken,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
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
      // P1-4: previously the klien branch trusted the JWT payload
      // unconditionally. That meant a klien account flipped to
      // status_klien='Non-Aktif' or 'Blacklist' (terminated contract,
      // suspended account) could still use any unexpired access token
      // they held — up to 30 minutes of continued access after
      // suspension, plus another 7 days if they still had a refresh
      // token. We now hit the DB on every request: a single SELECT
      // gated by status_klien='Aktif'. If the row isn't there or the
      // status isn't 'Aktif', the request is rejected as 401, the
      // mobile client sees Session expired, and re-login will fail
      // through auth.service.js (which has its own status check).
      const active = await queryOne(
        `SELECT id FROM clients WHERE id = $1 AND status_klien = 'Aktif'`,
        [decoded.client_id]
      );
      if (!active) {
        return res.status(401).json({ error: 'Akun klien tidak aktif' });
      }
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
  generateRefreshTokenForClient,  // P1-2
  rotateRefreshToken,              // P1-3
  verifyRefreshToken,
  revokeRefreshToken,
  auth,
  requireRole,
};
