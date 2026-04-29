// backend/db/paginate.js
// 分页查询工具，消除各路由中重复的分页计算逻辑

/**
 * 解析分页参数（1-indexed，默认 page=1, pageSize=10）
 * @param {object} query - req.query
 * @param {number} [defaultPageSize=10]
 * @returns {{ page: number, pageSize: number, offset: number }}
 */
function parsePage(query, defaultPageSize) {
  const page     = Math.max(1, parseInt(query.page) || 1);
  const pageSize = Math.max(1, parseInt(query.pageSize) || defaultPageSize || 10);
  const offset   = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

/**
 * 构建分页响应体
 * @param {Array}  list
 * @param {number} total
 * @param {number} page
 * @param {number} pageSize
 * @returns {{ list, total, page, pageSize, totalPages }}
 */
function pageResult(list, total, page, pageSize) {
  return { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

module.exports = { parsePage, pageResult };
