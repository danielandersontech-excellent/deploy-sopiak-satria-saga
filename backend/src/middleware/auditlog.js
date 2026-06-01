/**
 * AUDIT LOG MIDDLEWARE - Auto-logs all write operations
 * Records: who, what, when, where, and the data
 *
 * P1-1 (Tahap 5): audit_log.user_id is `uuid` and rejects any non-UUID
 * value. Klien JWT subjects look like "client-<uuid>" (string prefix +
 * UUID), so passing them straight into the INSERT used to throw
 *   `invalid input syntax for type uuid: "client-..."`
 * and the audit row was lost. Now the helper guards: if the userId
 * value isn't a UUID, we insert NULL into user_id and carry the
 * actor's name in user_nama plus the raw subject inside the detail
 * JSON, so the trail is still queryable.
 */
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

// P1-1: A lenient UUID detector. We deliberately don't require the
// full 8-4-4-4-12 form here — we just want to reject anything that
// can't possibly be a uuid before it reaches Postgres. The 8-hex +
// dash + 4-hex prefix is enough to distinguish from the "client-<n>"
// pattern that used to slip through. Postgres itself does the strict
// validation on insert if a value matches this prefix.
const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}/i;
const isUUID = (s) => UUID_PREFIX_RE.test(String(s == null ? '' : s));

// Log an audit entry
async function logAudit(userId, userNama, action, resource, resourceId, detail, ip) {
  try {
    // P1-1: split actor identity. If it's a uuid, it's a staff user
    // and goes into user_id directly. If not (klien "client-<id>"
    // subject, system action with no subject, anything else), we
    // store NULL in user_id and stash the original value inside the
    // detail JSON so the audit row is still attributable.
    let safeUserId = null;
    let detailWithActor = detail;
    if (userId != null && isUUID(userId)) {
      safeUserId = userId;
    } else if (userId != null) {
      // Carry the original non-UUID actor reference in detail so the
      // row remains forensically useful. We don't clobber any
      // existing detail.actor key if the caller set one.
      const baseDetail = (typeof detail === 'object' && detail !== null) ? { ...detail } : { raw: detail };
      if (!('actor' in baseDetail)) {
        baseDetail.actor = String(userId);
      }
      detailWithActor = baseDetail;
    }

    await query(
      `INSERT INTO audit_log (user_id, user_nama, action, resource, resource_id, detail, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [safeUserId, userNama, action, resource, resourceId || null,
       typeof detailWithActor === 'string' ? detailWithActor : JSON.stringify(detailWithActor || {}),
       ip || null]
    );
  } catch (err) {
    logger.error(`[Audit] Failed to log: ${err.message}`);
  }
}

// Express middleware - auto-capture POST/PUT/DELETE responses
function auditMiddleware(resource) {
  return (req, res, next) => {
    // Only log write operations
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();

    // Capture original res.json
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // Log after successful response
      if (res.statusCode < 400 && req.user) {
        const action = req.method === 'POST' ? 'CREATE'
                     : req.method === 'PUT' ? 'UPDATE'
                     : 'DELETE';
        const resourceId = data?.id || req.params?.id || null;
        const detail = {
          method: req.method,
          path: req.originalUrl,
          body: sanitizeBody(req.body),
        };
        const ip = req.ip || req.headers['x-forwarded-for'] || null;
        logAudit(req.user.id, req.user.nama, action, resource, resourceId, detail, ip);
      }
      return originalJson(data);
    };
    next();
  };
}

// Remove sensitive fields from log
function sanitizeBody(body) {
  if (!body) return {};
  const clean = { ...body };
  delete clean.pin;
  delete clean.pin_hash;
  delete clean.old_pin;
  delete clean.new_pin;
  delete clean.password;
  delete clean.token;
  // Truncate large fields
  for (const key of Object.keys(clean)) {
    if (typeof clean[key] === 'string' && clean[key].length > 500) {
      clean[key] = clean[key].substring(0, 500) + '...(truncated)';
    }
  }
  return clean;
}

// Direct log function for custom events
async function logEvent(userId, userNama, action, resource, resourceId, detail) {
  return logAudit(userId, userNama, action, resource, resourceId, detail, null);
}

module.exports = { auditMiddleware, logEvent, logAudit, isUUID };