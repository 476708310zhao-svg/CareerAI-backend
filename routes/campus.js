const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { parseId } = require('../db/utils');
const { formatCampus: fmt } = require('../db/formatters');
const { ok, fail } = require('../utils/response');

const ALL_LABEL = '\u5168\u90e8';
const GENERAL_POSITION = '\u7efc\u5408';
const MAX_PAGE_SIZE = 50;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function cleanText(value) {
  return String(value || '').trim();
}

function isActiveFilter(value) {
  const text = cleanText(value);
  return text && text !== ALL_LABEL;
}

function parsePageNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function includesValue(list, value) {
  return Array.isArray(list) && list.includes(value);
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function parseDateKey(value) {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function timestampToShanghaiDateKey(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return '';
  if (!match[4]) return `${match[1]}-${match[2]}-${match[3]}`;
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] || 0),
    Number(match[5] || 0),
    Number(match[6] || 0)
  );
  const shanghai = new Date(utc + SHANGHAI_OFFSET_MS);
  return [
    shanghai.getUTCFullYear(),
    String(shanghai.getUTCMonth() + 1).padStart(2, '0'),
    String(shanghai.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function campusBusinessDateKey(item) {
  return parseDateKey(item && item.startDate) || timestampToShanghaiDateKey(item && item.createdAt);
}

function campusStartDateKey(item) {
  return parseDateKey(item && item.startDate);
}

function matchesCampusAdvancedFilters(item, filters) {
  const educationLevel = cleanText(filters.education_level);
  const overseasFriendly = cleanText(filters.overseas_friendly);
  const visa = cleanText(filters.visa);
  const deadlineWindow = cleanText(filters.deadline_window);

  if (isActiveFilter(educationLevel) && !includesValue(item.educationTags, educationLevel)) return false;
  if (overseasFriendly === '1' && !item.overseasFriendly) return false;
  if (visa === 'support' && item.visaStatus !== 'support') return false;
  if (visa === 'info' && !['support', 'verify', 'info'].includes(item.visaStatus)) return false;
  if (visa === 'verify' && item.visaStatus !== 'verify') return false;
  if (deadlineWindow === '7d' && item.deadlineWindow !== '7d' && item.deadlineWindow !== 'urgent') return false;
  if (deadlineWindow === '30d' && !['7d', '30d', 'urgent'].includes(item.deadlineWindow)) return false;
  if (deadlineWindow === 'open' && item.deadlineWindow === 'expired') return false;
  if (deadlineWindow === 'expired' && item.deadlineWindow !== 'expired') return false;

  return true;
}

// GET /api/campus
router.get('/', (req, res) => {
  try {
    const {
      region,
      position_type,
      year,
      keyword,
      recruit_type,
      written_test,
      industry,
      education_level,
      overseas_friendly,
      visa,
      deadline_window,
      grad_year,
      latest_day,
      latest_date,
      sort = '',
      page = 0,
      pageSize = 20
    } = req.query;

    const pageNo = parsePageNumber(page, 0);
    const limit = Math.min(parsePageNumber(pageSize, 20) || 20, MAX_PAGE_SIZE);
    const offset = pageNo * limit;
    const conds = ['1=1'];
    const params = [];

    if (isActiveFilter(region)) {
      conds.push('region = ?');
      params.push(cleanText(region));
    }
    if (isActiveFilter(position_type)) {
      conds.push('(position_type = ? OR position_type = ?)');
      params.push(cleanText(position_type), GENERAL_POSITION);
    }
    if (isActiveFilter(recruit_type)) {
      conds.push('recruit_type = ?');
      params.push(cleanText(recruit_type));
    }
    if (isActiveFilter(written_test)) {
      conds.push('written_test = ?');
      params.push(cleanText(written_test));
    }
    if (isActiveFilter(industry)) {
      conds.push('industry LIKE ?');
      params.push('%' + cleanText(industry) + '%');
    }
    if (cleanText(grad_year)) {
      const gradYear = Number(grad_year);
      if (Number.isFinite(gradYear)) {
        conds.push('grad_year = ?');
        params.push(Math.floor(gradYear));
      }
    }
    if (cleanText(year)) {
      const recruitYear = Number(year);
      if (Number.isFinite(recruitYear)) {
        conds.push('recruit_year = ?');
        params.push(Math.floor(recruitYear));
      }
    }
    if (cleanText(keyword)) {
      conds.push('(company LIKE ? OR position_name LIKE ? OR industry LIKE ? OR notes LIKE ?)');
      const kw = '%' + cleanText(keyword) + '%';
      params.push(kw, kw, kw, kw);
    }

    const where = conds.join(' AND ');
    const orderBy = sort === 'latest'
      ? 'start_date DESC, created_at DESC, is_hot DESC, recruit_year DESC, company ASC'
      : 'is_hot DESC, recruit_year DESC, start_date DESC, company ASC';
    const rows = db.prepare(
      'SELECT * FROM campus_schedules WHERE ' + where +
      ' ORDER BY ' + orderBy
    ).all(...params);
    let list = rows
      .map(fmt)
      .filter(item => matchesCampusAdvancedFilters(item, {
        education_level,
        overseas_friendly,
        visa,
        deadline_window
      }));

    let latestDate = '';
    if (isTruthy(latest_day) || cleanText(latest_date)) {
      const hasStartDates = list.some(item => campusStartDateKey(item));
      const keyForLatest = hasStartDates ? campusStartDateKey : campusBusinessDateKey;
      latestDate = parseDateKey(latest_date) || list
        .map(keyForLatest)
        .filter(Boolean)
        .sort()
        .pop() || '';
      if (latestDate) {
        list = list.filter(item => keyForLatest(item) === latestDate);
      }
    }
    const pageList = list.slice(offset, offset + limit);

    ok(res, { list: pageList, total: list.length, latestDate });
  } catch (err) {
    console.error('[campus] list failed:', err);
    fail(res, '\u6821\u62db\u5217\u8868\u52a0\u8f7d\u5931\u8d25');
  }
});

// GET /api/campus/meta
router.get('/meta', (_req, res) => {
  const years = db.prepare('SELECT DISTINCT recruit_year FROM campus_schedules ORDER BY recruit_year DESC').all().map(r => r.recruit_year);
  const gradYears = db.prepare('SELECT DISTINCT grad_year FROM campus_schedules ORDER BY grad_year DESC').all().map(r => r.grad_year);
  const recruitTypes = db.prepare('SELECT DISTINCT recruit_type FROM campus_schedules ORDER BY recruit_type').all().map(r => r.recruit_type);
  const industries = db.prepare("SELECT DISTINCT industry FROM campus_schedules WHERE industry != '' ORDER BY industry").all().map(r => r.industry);
  ok(res, {
    years,
    gradYears,
    recruitTypes,
    industries,
    educationLevels: ['本科及以上', '硕士友好', '博士/科研'],
    visaOptions: [
      { label: '有签证信息', value: 'info' },
      { label: 'Sponsor友好', value: 'support' },
      { label: '需核实', value: 'verify' }
    ],
    deadlineWindows: [
      { label: '7天内', value: '7d' },
      { label: '30天内', value: '30d' },
      { label: '仍可投', value: 'open' },
      { label: '已截止', value: 'expired' }
    ]
  });
});

// GET /api/campus/:id
router.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return fail(res, '\u53c2\u6570\u65e0\u6548', 400);
  const s = db.prepare('SELECT * FROM campus_schedules WHERE id = ?').get(id);
  if (!s) return fail(res, '\u6821\u62db\u4fe1\u606f\u4e0d\u5b58\u5728', 404);
  db.prepare('UPDATE campus_schedules SET view_count = view_count + 1 WHERE id = ?').run(id);
  ok(res, fmt(s));
});

module.exports = router;
