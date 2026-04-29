/**
 * db/utils.js - 数据库辅助工具
 * 集中管理在多个路由中共用的工具函数，避免重复定义。
 */

/** 安全解析 JSON 对象字段，失败返回 {} */
function j(str)  { try { return JSON.parse(str || '{}'); } catch(e) { return {}; } }

/** 安全解析 JSON 数组字段，失败返回 [] */
function ja(str) { try { return JSON.parse(str || '[]'); } catch(e) { return []; } }

/**
 * 安全解析路由 ID 参数。
 * 必须为正整数且 <= 2^31-1（SQLite INTEGER 最大值），否则返回 null。
 * 替代裸 parseInt，防止负数、0、超大整数、NaN 进入数据库查询。
 */
function parseId(s) {
  const n = parseInt(s, 10);
  if (isNaN(n) || n < 1 || n > 2147483647) return null;
  return n;
}

module.exports = { j, ja, parseId };
