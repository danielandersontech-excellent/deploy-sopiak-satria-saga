/**
 * PAGINATION UTILITY
 * Standar pagination untuk semua endpoint list.
 *
 * Query params: ?page=1&limit=20&sort=created_at&order=desc
 * Response format:
 *   { data: [...], pagination: { page, limit, total, totalPages, hasNext, hasPrev } }
 */

const DEFAULT_PAGE_SIZE = parseInt(process.env.DEFAULT_PAGE_SIZE || '20');
const MAX_PAGE_SIZE = parseInt(process.env.MAX_PAGE_SIZE || '100');

/**
 * Parse pagination params from request query
 * @param {object} query - req.query
 * @returns {{ page: number, limit: number, offset: number, sort: string, order: string }}
 */
function parsePagination(query = {}) {
  let page = parseInt(query.page) || 1;
  if (page < 1) page = 1;

  let limit = parseInt(query.limit) || DEFAULT_PAGE_SIZE;
  if (limit < 1) limit = 1;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

  const offset = (page - 1) * limit;

  // Sort column - sanitize to prevent SQL injection
  const sort = query.sort ? query.sort.replace(/[^a-zA-Z0-9_.]/g, '') : 'created_at';
  const order = query.order === 'asc' ? 'ASC' : 'DESC';

  return { page, limit, offset, sort, order };
}

/**
 * Build pagination response
 * @param {any[]} data - query results
 * @param {number} total - COUNT(*) result
 * @param {number} page - current page
 * @param {number} limit - items per page
 */
function paginatedResponse(data, total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

module.exports = { parsePagination, paginatedResponse, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
