/**
 * AUDIT LOG MIDDLEWARE - Auto-logs all write operations
 * Records: who, what, when, where, and the data
 */
const { query } = require('../config/database');

// Log an audit entry
async function logAudit(userId, userNama, action, resource, resourceId, detail, ip) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, user_nama, action, resource, resource_id, detail, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, userNama, action, resource, resourceId || null,
       typeof detail === 'string' ? detail : JSON.stringify(detail || {}),
       ip || null]
    );
  } catch (err) {
    console.error('[Audit] Failed to log:', err.message);
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

module.exports = { auditMiddleware, logEvent, logAudit };
