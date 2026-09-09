/**
 * BASE REPOSITORY - Reusable CRUD operations for any table
 * v23 - Fixed update to allow null/empty/0/false values
 * v24 - Added sanitizeOrderBy as defense-in-depth
 * v25 - SECURITY (P0-3): Whitelist column identifiers in create()/update()
 *       and apply the same validator in findAll() so all three code-paths use
 *       a single, consistent identifier rule. Untrusted strings can never be
 *       interpolated into the SQL query as a column name.
 */
const { queryOne, queryAll, query } = require('../config/database');

// ---------------------------------------------------------------------------
// SECURITY: Strict identifier validator.
// A valid SQL identifier must start with a letter or underscore and contain
// only letters, digits, and underscores. Anything else (spaces, quotes,
// semicolons, dashes, dots, parentheses, comment markers, etc.) is rejected.
// This is the ONLY function allowed to decide whether a string can be
// interpolated into SQL as a column name.
// ---------------------------------------------------------------------------
const COLUMN_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function isValidColumn(col) {
  return typeof col === 'string' && COLUMN_NAME_RE.test(col);
}

function sanitizeOrderBy(orderBy) {
  if (typeof orderBy !== 'string' || !orderBy) return 'created_at DESC';
  if (!/^[a-zA-Z0-9_.,\s]+$/.test(orderBy)) return 'created_at DESC';
  return orderBy;
}

// [Audit 2A] Kunci query-string yang BUKAN nama kolom tetapi lolos isValidColumn
// (mis. ?page=1 → `AND lokasi.page = $1` → error kolom tidak ada → 500).
// Dilewati diam-diam, sama seperti kolom tak valid.
const RESERVED_QUERY_KEYS = new Set(['page', 'limit', 'offset', 'sort', 'order', 'asc', 'search', 'all', 'q', '_']);

class BaseRepository {
  constructor(tableName) {
    this.table = tableName;
  }

  async findAll(options = {}) {
    const { where = {}, orderBy = 'created_at DESC', limit, joins = '' } = options;
    const conditions = ['1=1'];
    const params = [];
    const regularFilters = {};
    const gteFilters = {};
    const lteFilters = {};
    const inFilters = {};
    let customOrder = null;
    let customAsc = null;

    for (const [col, val] of Object.entries(where)) {
      if (val === undefined || val === null || val === '') continue;
      if (col === 'order') { customOrder = val; continue; }
      if (col === 'asc') { customAsc = val; continue; }
      if (RESERVED_QUERY_KEYS.has(col)) continue;
      if (col.endsWith('_gte')) { gteFilters[col.slice(0, -4)] = val; continue; }
      if (col.endsWith('_lte')) { lteFilters[col.slice(0, -4)] = val; continue; }
      // [Audit 2A] Nilai array (dipakai utils/scope: lokasi_ids) → = ANY($n).
      // Array KOSONG = sentinel deny-all → AND FALSE (fail-closed).
      if (Array.isArray(val)) {
        if (!isValidColumn(col)) continue;
        if (val.length === 0) { conditions.push('FALSE'); continue; }
        inFilters[col] = val; continue;
      }
      if (typeof val === 'string' && val.includes(',') && !val.includes(' ')) { inFilters[col] = val.split(','); continue; }
      regularFilters[col] = val;
    }

    // SECURITY: silently drop any filter whose column name is not a valid
    // SQL identifier. The query-string is attacker-controlled, so we prefer
    // skipping bad keys over throwing (avoids handing the attacker an oracle
    // and avoids breaking legitimate requests that include odd extra params).
    for (const [col, val] of Object.entries(regularFilters)) {
      if (!isValidColumn(col)) continue;
      params.push(val);
      conditions.push(`${this.table}.${col} = $${params.length}`);
    }
    for (const [col, val] of Object.entries(gteFilters)) {
      if (!isValidColumn(col)) continue;
      params.push(val);
      conditions.push(`${this.table}.${col} >= $${params.length}`);
    }
    for (const [col, val] of Object.entries(lteFilters)) {
      if (!isValidColumn(col)) continue;
      params.push(val);
      conditions.push(`${this.table}.${col} <= $${params.length}`);
    }
    for (const [col, vals] of Object.entries(inFilters)) {
      if (!isValidColumn(col)) continue;
      params.push(vals);
      conditions.push(`${this.table}.${col} = ANY($${params.length})`);
    }

    let finalOrder = sanitizeOrderBy(orderBy);
    if (customOrder && isValidColumn(customOrder)) {
      const direction = customAsc === 'true' ? 'ASC' : 'DESC';
      finalOrder = `${customOrder} ${direction}`;
    }

    let sql = `SELECT ${this.table}.* ${joins ? `, ${joins.select || ''}` : ''} FROM ${this.table}`;
    if (joins.from) sql += ` ${joins.from}`;
    sql += ` WHERE ${conditions.join(' AND ')} ORDER BY ${finalOrder}`;
    if (limit) { params.push(parseInt(limit)); sql += ` LIMIT $${params.length}`; }
    return queryAll(sql, params);
  }

  async findById(id) {
    return queryOne(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
  }

  async create(data) {
    // SECURITY (P0-3): reject any column name that is not a strict identifier
    // BEFORE building the SQL. Throwing here is the right behavior: any caller
    // passing a non-identifier key is either a bug or an injection attempt,
    // and we never want to silently drop legitimate fields from a write.
    const keys = Object.keys(data)
      .filter(k => k !== 'id' && data[k] !== undefined);
    for (const k of keys) {
      if (!isValidColumn(k)) {
        throw new Error(`Invalid column name in create(): ${JSON.stringify(k)}`);
      }
    }
    const vals = keys.map(k => data[k]);
    const placeholders = keys.map((_, i) => `$${i + 1}`);
    return queryOne(
      `INSERT INTO ${this.table} (${keys.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
      vals
    );
  }

  async update(id, data) {
    // FIXED: Allow null, empty string, 0, false - only skip undefined
    const computedFields = ['lokasi_nama', 'klien_nama', 'klien_kode', 'pos_nama', 'user_nama', 'user_nrp', 'shift_nama', 'waktu_mulai', 'waktu_selesai'];
    const keys = Object.keys(data).filter(k => {
      if (k === 'id' || k === 'created_at') return false;
      if (data[k] === undefined) return false;
      if (computedFields.includes(k)) return false;
      return true;
    });

    if (!keys.length) return this.findById(id);

    // SECURITY (P0-3): same strict identifier check as create(). Any key that
    // would be interpolated into the SET clause must match the validator.
    for (const k of keys) {
      if (!isValidColumn(k)) {
        throw new Error(`Invalid column name in update(): ${JSON.stringify(k)}`);
      }
    }

    const vals = keys.map(k => data[k]);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`);

    if (!keys.includes('updated_at')) {
      sets.push('updated_at = NOW()');
    }

    vals.push(id);
    try {
      return await queryOne(
        `UPDATE ${this.table} SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
        vals
      );
    } catch (err) {
      // If updated_at column doesn't exist, retry without it
      if (err.message && err.message.includes('updated_at')) {
        const setsNoUpd = keys.map((k, i) => `${k} = $${i + 1}`);
        return queryOne(
          `UPDATE ${this.table} SET ${setsNoUpd.join(', ')} WHERE id = $${vals.length} RETURNING *`,
          vals
        );
      }
      throw err;
    }
  }

  async delete(id) {
    await query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
    return true;
  }

  async count(where = {}) {
    const conditions = ['1=1'];
    const params = [];
    for (const [col, val] of Object.entries(where)) {
      // [Audit 2A] '' juga dilewati (konsisten dengan findAll) — '' pada kolom
      // uuid/date memicu error cast di Postgres.
      if (val === undefined || val === null || val === '') continue;
      if (RESERVED_QUERY_KEYS.has(col)) continue;
      // SECURITY: same identifier rule applies to COUNT WHERE filters.
      if (!isValidColumn(col)) continue;
      params.push(val);
      conditions.push(`${col} = $${params.length}`);
    }
    const row = await queryOne(
      `SELECT COUNT(*)::int as count FROM ${this.table} WHERE ${conditions.join(' AND ')}`,
      params
    );
    return row.count;
  }

  async raw(sql, params = []) { return queryAll(sql, params); }
  async rawOne(sql, params = []) { return queryOne(sql, params); }
}

module.exports = BaseRepository;
