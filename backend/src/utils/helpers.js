/**
 * HELPERS - Shared utility functions
 */

// Haversine distance calculation (meters)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Format date to Indonesian locale
function fmtDate(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
}

// Format time
function fmtTime(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
  catch { return String(d); }
}

// Build dynamic WHERE clause
function buildWhere(filters, startIndex = 1) {
  const conditions = [];
  const params = [];
  let idx = startIndex;
  for (const [column, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params.push(value);
      conditions.push(`${column} = $${idx++}`);
    }
  }
  return { conditions, params, nextIndex: idx };
}

// Build dynamic UPDATE SET clause
function buildUpdate(fields) {
  const sets = [];
  const params = [];
  let idx = 1;
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      params.push(value);
      sets.push(`${key} = $${idx++}`);
    }
  }
  return { sets, params, nextIndex: idx };
}

module.exports = { haversine, fmtDate, fmtTime, buildWhere, buildUpdate };