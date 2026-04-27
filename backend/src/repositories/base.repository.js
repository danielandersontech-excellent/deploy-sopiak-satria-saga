/**
 * BASE REPOSITORY - Reusable CRUD operations for any table
 * v23 - Fixed update to allow null/empty/0/false values
 * v24 - Added sanitizeOrderBy as defense-in-depth
 */
const { queryOne, queryAll, query } = require('../config/database');

function sanitizeOrderBy(orderBy) {
  if (typeof orderBy !== 'string' || !orderBy) return 'created_at DESC';
  if (!/^[a-zA-Z0-9_.,\s]+$/.test(orderBy)) return 'created_at DESC';
  return orderBy;
}

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
      if (col === 'limit' || col === 'offset') continue;
      if (col === 'order') { customOrder = val; continue; }
      if (col === 'asc') { customAsc = val; continue; }
      if (col.endsWith('_gte')) { gteFilters[col.slice(0, -4)] = val; continue; }
      if (col.endsWith('_lte')) { lteFilters[col.slice(0, -4)] = val; continue; }
      if (typeof val === 'string' && val.includes(',') && !val.includes(' ')) { inFilters[col] = val.split(','); continue; }
      regularFilters[col] = val;
    }

    for (const [col, val] of Object.entries(regularFilters)) {
      const safeCol = col.replace(/[^a-zA-Z0-9_]/g, '');
      params.push(val);
      conditions.push(`${this.table}.${safeCol} = $${params.length}`);
    }
    for (const [col, val] of Object.entries(gteFilters)) {
      const safeCol = col.replace(/[^a-zA-Z0-9_]/g, '');
      params.push(val);
      conditions.push(`${this.table}.${safeCol} >= $${params.length}`);
    }
    for (const [col, val] of Object.entries(lteFilters)) {
      const safeCol = col.replace(/[^a-zA-Z0-9_]/g, '');
      params.push(val);
      conditions.push(`${this.table}.${safeCol} <= $${params.length}`);
    }
    for (const [col, vals] of Object.entries(inFilters)) {
      const safeCol = col.replace(/[^a-zA-Z0-9_]/g, '');
      params.push(vals);
      conditions.push(`${this.table}.${safeCol} = ANY($${params.length})`);
    }

    let finalOrder = sanitizeOrderBy(orderBy);
    if (customOrder) {
      const safeOrder = customOrder.replace(/[^a-zA-Z0-9_]/g, '');
      const direction = customAsc === 'true' ? 'ASC' : 'DESC';
      finalOrder = `${safeOrder} ${direction}`;
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
    const keys = Object.keys(data).filter(k => k !== 'id' && data[k] !== undefined);
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
      if (val !== undefined && val !== null) {
        params.push(val);
        conditions.push(`${col} = $${params.length}`);
      }
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
