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
const { generateToken, generateRefreshToken, verifyRefreshToken, revokeRefreshToken } = require('../middleware/auth');
const { queryOne } = require('../config/database');

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
  try {
    const refresh_token = req.body.refresh_token || req.cookies?.ptsss_refresh;
    if (!refresh_token) return res.status(400).json({ error: 'Refresh token required' });
    const stored = await verifyRefreshToken(refresh_token);
    if (!stored) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [stored.user_id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const newToken = generateToken(user);
    const newRefresh = await generateRefreshToken(user.id);
    setAuthCookies(res, newToken, newRefresh);
    res.json({
      token: newToken, refresh_token: newRefresh,
      user: { id: user.id, nrp: user.nrp, nama: user.nama, role: user.role },
    });
  } catch (e) {
    res.status(500).json({ error: 'Refresh token failed' });
  }
};

exports.logout = async (req, res) => {
  try {
    if (req.user) await revokeRefreshToken(req.user.id);
    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Logout failed' });
  }
};
