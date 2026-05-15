/**
 * AUTH CONTROLLER - httpOnly cookie + JSON response
 *
 * Web admin uses httpOnly cookies, mobile app uses Authorization header.
 *
 * IMPORTANT — Cross-subdomain cookies (Coolify multi-domain setup):
 *
 *   Production layout:
 *     hq.sopiaksatriasaga.com   → web-admin (Next.js, fetch with credentials)
 *     api.sopiaksatriasaga.com  → backend   (sets cookies on this host)
 *
 *   Without COOKIE_DOMAIN, the Set-Cookie from `api.*` is scoped to `api.*`
 *   only — browser won't send it to `hq.*`. Web-admin then loops
 *   /login → / → /login forever after a successful login.
 *
 *   Set COOKIE_DOMAIN=.sopiaksatriasaga.com (with leading dot) so the cookie
 *   is scoped to the parent domain. Set COOKIE_SAMESITE=none + COOKIE_SECURE=true
 *   so the browser accepts a cross-site cookie over HTTPS.
 */
const authService = require('../services/auth.service');
const {
  generateToken,
  generateRefreshToken,
  generateRefreshTokenForClient,
  verifyRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} = require('../middleware/auth');
const { queryOne } = require('../config/database');
const { logger } = require('../utils/logger');

function buildCookieOptions(maxAgeMs, pathOverride) {
  const secure = process.env.COOKIE_SECURE === 'true';
  let sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  if (sameSite === 'none' && !secure) sameSite = 'lax';
  const opts = {
    httpOnly: true, secure, sameSite,
    path: pathOverride || '/',
    maxAge: maxAgeMs,
  };
  if (process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
  return opts;
}

const ACCESS_TTL_MS = 30 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function setAuthCookies(res, token, refreshToken) {
  res.cookie('ptsss_token', token, buildCookieOptions(ACCESS_TTL_MS, '/'));
  if (refreshToken) {
    res.cookie('ptsss_refresh', refreshToken, buildCookieOptions(REFRESH_TTL_MS, '/api/auth'));
  }
}

function clearAuthCookies(res) {
  const base = { path: '/' };
  if (process.env.COOKIE_DOMAIN) base.domain = process.env.COOKIE_DOMAIN;
  res.clearCookie('ptsss_token', base);
  res.clearCookie('ptsss_refresh', { ...base, path: '/api/auth' });
}

exports.login = async (req, res) => {
  try {
    const data = await authService.login(req.body.nrp, req.body.pin);
    setAuthCookies(res, data.token, data.refresh_token);
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
};

exports.me = async (req, res) => {
  try { res.json(await authService.getProfile(req.user.id)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message || 'Server error' }); }
};

exports.changePin = async (req, res) => {
  try { res.json(await authService.changePin(req.user.id, req.body.old_pin, req.body.new_pin)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message || 'Server error' }); }
};

exports.register = async (req, res) => {
  try { res.status(201).json(await authService.register(req.user, req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message || 'Server error' }); }
};

exports.refreshToken = async (req, res) => {
  // P1-3: atomic rotation + replay detection.
  // P1-2: handle both `user_id` and `client_id` subject types.
  //
  // The flow:
  //   1. Pull the presented refresh token from body or cookie.
  //   2. Call rotateRefreshToken() — this does the DELETE/INSERT in
  //      a single transaction and returns {subjectType, subjectId,
  //      newToken}. If two requests race or the token has already
  //      been consumed, the second one throws REFRESH_TOKEN_REUSED.
  //   3. Look up the subject (users or clients) to mint a new access
  //      token and build the response payload.
  //
  // On REFRESH_TOKEN_REUSED we return 401 — the client must re-login.
  // We deliberately do NOT revoke ALL of the subject's tokens here:
  // doing so would let an attacker who guessed/replayed a token kick
  // the legitimate user off. We just refuse the racing/replaying
  // request; the winner of the race still holds a valid new token.
  try {
    const refresh_token = req.body.refresh_token || req.cookies?.ptsss_refresh;
    if (!refresh_token) return res.status(400).json({ error: 'Refresh token required' });

    let rotated;
    try {
      rotated = await rotateRefreshToken(refresh_token);
    } catch (e) {
      if (e.code === 'REFRESH_TOKEN_REUSED') {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }
      throw e;
    }

    if (rotated.subjectType === 'user') {
      const user = await queryOne('SELECT * FROM users WHERE id = $1', [rotated.subjectId]);
      if (!user) return res.status(401).json({ error: 'User not found' });
      const newAccess = generateToken(user);
      setAuthCookies(res, newAccess, rotated.newToken);
      return res.json({
        token: newAccess,
        refresh_token: rotated.newToken,
        user: { id: user.id, nrp: user.nrp, nama: user.nama, role: user.role },
      });
    }

    // P1-2: klien refresh path. The JWT shape mirrors what
    // auth.service.js issues on klien login: id is 'client-<n>',
    // role is 'klien', client_id is the integer PK.
    if (rotated.subjectType === 'client') {
      const client = await queryOne(
        `SELECT * FROM clients WHERE id = $1 AND status_klien = 'Aktif'`,
        [rotated.subjectId]
      );
      if (!client) return res.status(401).json({ error: 'Akun klien tidak aktif' });

      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET;
      const clientUserId = `client-${client.id}`;
      const newAccess = jwt.sign(
        {
          id: clientUserId,
          nrp: client.nrp_login || client.kode_klien,
          role: 'klien',
          nama: client.nama_klien,
          client_id: client.id,
        },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '30m' }
      );
      setAuthCookies(res, newAccess, rotated.newToken);
      return res.json({
        token: newAccess,
        refresh_token: rotated.newToken,
        user: {
          id: clientUserId,
          nrp: client.nrp_login || client.kode_klien,
          nama: client.nama_klien,
          role: 'klien',
          client_id: client.id,
        },
      });
    }

    // Shouldn't reach here — rotateRefreshToken always sets subjectType.
    return res.status(500).json({ error: 'Refresh token rotation produced no subject' });
  } catch (e) {
    logger.error(`[auth.controller] refreshToken error: ${e.message}`);
    res.status(500).json({ error: 'Refresh token failed' });
  }
};

exports.logout = async (req, res) => {
  try {
    if (req.user) {
      // Regular users: revokeRefreshToken matches on user_id.
      // Klien (P1-2): req.user.id is 'client-<n>' (a string), so we
      // need to delete by client_id instead. Without this, klien
      // refresh tokens linger in the DB after logout. They'd be
      // replaced on next login by the DELETE-then-INSERT inside
      // generateRefreshTokenForClient, but we'd rather not have a
      // valid token sitting in the DB after the user explicitly
      // asked to be logged out.
      if (req.user.role === 'klien' && req.user.client_id) {
        const { query } = require('../config/database');
        await query('DELETE FROM refresh_tokens WHERE client_id = $1', [req.user.client_id]);
      } else {
        await revokeRefreshToken(req.user.id);
      }
    }
    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Logout failed' });
  }
};
