const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { parseId } = require('../db/utils');
const { formatCampus: fmt } = require('../db/formatters');
const { ok, fail } = require('../utils/response');

// GET /api/campus
router.get('/', (req, res) => {
  const { region, position_type, year, keyword, recruit_type, written_test, industry, grad_year, page = 0, pageSize = 20 } = req.query;
  const offset = Number(page) * Number(pageSize);
  const conds = ['1=1'];
  const params = [];

  if (region && region !== '全部') { conds.push('region = ?'); params.push(region); }
  if (position_type && position_type !== '全部') { conds.push('(position_type = ? OR position_type = "综合")'); params.push(position_type); }
  if (recruit_type && recruit_type !== '全部') { conds.push('recruit_type = ?'); params.push(recruit_type); }
  if (written_test && written_test !== '全部') { conds.push('written_test = ?'); params.push(written_test); }
  if (industry && industry !== '全部') { conds.push('industry LIKE ?'); params.push('%' + industry + '%'); }
  if (grad_year) { conds.push('grad_year = ?'); params.push(Number(grad_year)); }
  if (year) { conds.push('recruit_year = ?'); params.push(Number(year)); }
  if (keyword) {
    conds.push('(company LIKE ? OR position_name LIKE ? OR industry LIKE ? OR notes LIKE ?)');
    const kw = '%' + keyword + '%';
    params.push(kw, kw, kw, kw);
  }

  const where = conds.join(' AND ');
  const list = db.prepare(
    'SELECT * FROM campus_schedules WHERE ' + where +
    ' ORDER BY is_hot DESC, recruit_year DESC, start_date DESC, company ASC LIMIT ? OFFSET ?'
  ).all(...params, Number(pageSize), offset);
  const { c: total } = db.prepare('SELECT COUNT(*) as c FROM campus_schedules WHERE ' + where).get(...params);

  ok(res, { list: list.map(fmt), total });
});

// GET /api/campus/meta
router.get('/meta', (_req, res) => {
  const years = db.prepare('SELECT DISTINCT recruit_year FROM campus_schedules ORDER BY recruit_year DESC').all().map(r => r.recruit_year);
  const gradYears = db.prepare('SELECT DISTINCT grad_year FROM campus_schedules ORDER BY grad_year DESC').all().map(r => r.grad_year);
  const recruitTypes = db.prepare('SELECT DISTINCT recruit_type FROM campus_schedules ORDER BY recruit_type').all().map(r => r.recruit_type);
  ok(res, { years, gradYears, recruitTypes });
});

// GET /api/campus/:id
router.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return fail(res, '参数无效', 400);
  const s = db.prepare('SELECT * FROM campus_schedules WHERE id = ?').get(id);
  if (!s) return fail(res, '校招信息不存在', 404);
  db.prepare('UPDATE campus_schedules SET view_count = view_count + 1 WHERE id = ?').run(id);
  ok(res, fmt(s));
});

module.exports = router;
