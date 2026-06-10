'use strict';

require('dotenv').config();

const https = require('https');
const db = require('../db/database');

const APP_ID = process.env.FEISHU_CAMPUS_APP_ID || process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_CAMPUS_APP_SECRET || process.env.FEISHU_APP_SECRET;
const BASE_TOKEN = process.env.FEISHU_CAMPUS_BASE_TOKEN || process.env.FEISHU_BASE_TOKEN || 'SAHbbOc68aH0sPscYu7cbKZjnnr';
const TABLE_ID = process.env.FEISHU_CAMPUS_TABLE_ID || process.env.FEISHU_TABLE_ID || 'tblnJnFOgllO4FYe';
const SOURCE = '飞书校招日历';

function assertConfig() {
  const missing = [];
  if (!APP_ID) missing.push('FEISHU_CAMPUS_APP_ID or FEISHU_APP_ID');
  if (!APP_SECRET) missing.push('FEISHU_CAMPUS_APP_SECRET or FEISHU_APP_SECRET');
  if (!BASE_TOKEN) missing.push('FEISHU_CAMPUS_BASE_TOKEN or FEISHU_BASE_TOKEN');
  if (!TABLE_ID) missing.push('FEISHU_CAMPUS_TABLE_ID or FEISHU_TABLE_ID');
  if (missing.length) {
    throw new Error(`Missing Feishu config: ${missing.join(', ')}`);
  }
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`JSON parse error: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('request timeout')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getAccessToken() {
  const res = await request({
    hostname: 'open.feishu.cn',
    path: '/open-apis/auth/v3/tenant_access_token/internal',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { app_id: APP_ID, app_secret: APP_SECRET });

  if (res.code !== 0) throw new Error(`获取 token 失败: ${res.msg || res.code}`);
  return res.tenant_access_token;
}

async function fetchAllRecords(token) {
  const all = [];
  let pageToken = '';
  let page = 1;

  while (true) {
    console.log(`  拉取第 ${page} 页...`);
    const qs = `page_size=500${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await request({
      hostname: 'open.feishu.cn',
      path: `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/records?${qs}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.code !== 0) throw new Error(`拉取记录失败: ${res.msg || res.code}`);

    const items = res.data?.items || [];
    all.push(...items);
    console.log(`  本页 ${items.length} 条，累计 ${all.length} 条`);

    if (!res.data?.has_more) break;
    pageToken = res.data.page_token;
    page += 1;
  }

  return all;
}

function pick(fields, names) {
  for (const name of names) {
    if (fields[name] !== undefined && fields[name] !== null && fields[name] !== '') {
      return fields[name];
    }
  }
  return '';
}

function text(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join('、');
  if (typeof value === 'object') {
    return String(value.text || value.value || value.name || value.link || value.url || '').trim();
  }
  return String(value).trim();
}

function list(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  return raw.split(/[、,，;；\n]/).map(item => item.trim()).filter(Boolean);
}

function url(value) {
  if (!value) return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value.link || value.url || text(value);
  }
  const raw = text(value);
  const match = raw.match(/https?:\/\/[^\s)）]+/);
  return match ? match[0] : '';
}

function dateValue(value) {
  if (!value) return '';
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

function gradYear(value) {
  const raw = text(value);
  const match = raw.match(/20\d{2}|\d{2}(?=届)/);
  if (!match) return 2026;
  const n = Number(match[0]);
  return n < 100 ? 2000 + n : n;
}

function industry(value) {
  const raw = text(value);
  if (/金融|银行|证券|基金|保险/.test(raw)) return '金融';
  if (/互联网|科技|AI|软件|IT/.test(raw)) return '互联网';
  if (/新能源|汽车|能源|电池/.test(raw)) return '汽车新能源';
  if (/生物|医药|医疗/.test(raw)) return '生物医药';
  if (/国央企|国企|央企/.test(raw)) return '国央企';
  if (/通信|硬件|芯片|半导体/.test(raw)) return '通信/硬件';
  if (/咨询/.test(raw)) return '咨询';
  return raw || '其他';
}

function recruitType(value) {
  const raw = text(value);
  if (/暑期|实习/.test(raw)) return '暑期实习';
  if (/春招/.test(raw)) return '春招';
  if (/秋招/.test(raw)) return '秋招';
  return raw || '校招';
}

function positionType(value) {
  const raw = text(value);
  if (/算法|研发|开发|工程|测试|运维|数据|技术|软件|硬件|芯片|半导体/i.test(raw)) return '技术';
  if (/产品|运营|市场|销售|职能|人力|财务|法务|管培/i.test(raw)) return '综合';
  if (/投行|研究|证券|银行|金融|风控|量化/i.test(raw)) return '金融';
  return '综合';
}

function validCompany(company) {
  if (!company) return false;
  if (/^https?:\/\//i.test(company)) return false;
  if (/必读|文档|使用|助手|选择包括|筛选/.test(company)) return false;
  return true;
}

function transform(item) {
  const f = item.fields || {};
  const company = text(pick(f, ['公司', '公司名称', '企业名称']));
  if (!validCompany(company)) return null;

  const positionName = text(pick(f, ['岗位', '岗位名称', '职位', '职位名称', '岗位要求专业']));
  const locations = list(pick(f, ['工作地点', '地点', '城市']));
  const recruit = pick(f, ['招聘类型', '类型', '校招类型']);
  const industryValue = pick(f, ['公司行业', '行业']);
  const deadline = pick(f, ['截止日期', '截止时间', '网申截止']);
  const start = pick(f, ['开始时间', '开始日期', '发布日期']);
  const salary = text(pick(f, ['薪资', '薪酬']));
  const note = text(pick(f, ['备注', '说明']));
  const degree = text(pick(f, ['学历要求', '学历']));
  const written = text(pick(f, ['是否免笔试', '笔试']));
  const applyUrl = url(pick(f, ['投递链接', '投递地址', '网申链接']));
  const announceUrl = url(pick(f, ['公告链接', '官网链接', '原文链接']));
  const notes = [note, degree ? `学历要求：${degree}` : '', salary ? `薪资：${salary}` : '']
    .filter(Boolean)
    .join('\n');

  return {
    company,
    region: '中国内地',
    position_type: positionType(positionName),
    recruit_year: 2025,
    grad_year: gradYear(pick(f, ['届次', '毕业届次', '毕业年份'])),
    recruit_type: recruitType(recruit),
    industry: industry(industryValue),
    start_date: dateValue(start),
    deadline_date: dateValue(deadline),
    locations: JSON.stringify(locations),
    position_name: positionName.slice(0, 500),
    apply_url: applyUrl,
    announce_url: announceUrl,
    written_test: /免笔试/.test(written) ? '含免笔试' : (written || '需要笔试'),
    notes: notes.slice(0, 1000),
    source: SOURCE,
    is_verified: 1,
    is_hot: 0,
    timeline: '[]'
  };
}

async function main() {
  console.log('=== 飞书校招日历同步（服务器版）===');
  console.log(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  assertConfig();

  console.log('\n1. 获取飞书访问令牌...');
  const token = await getAccessToken();
  console.log('   ✓ 令牌获取成功');

  console.log('\n2. 拉取飞书数据...');
  const items = await fetchAllRecords(token);
  console.log(`   共获取 ${items.length} 条原始记录`);

  const records = items.map(transform).filter(Boolean);
  const seen = new Set();
  const deduped = records.filter((record) => {
    const key = [
      record.company,
      record.recruit_type,
      record.position_name,
      record.start_date,
      record.deadline_date,
      record.apply_url || record.announce_url
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log('\n3. 写入数据库...');
  const insert = db.prepare(`
    INSERT INTO campus_schedules
      (company, region, position_type, recruit_year, grad_year, recruit_type,
       industry, start_date, deadline_date, locations, position_name,
       apply_url, announce_url, written_test, notes, source, is_verified, is_hot, timeline)
    VALUES
      (@company, @region, @position_type, @recruit_year, @grad_year, @recruit_type,
       @industry, @start_date, @deadline_date, @locations, @position_name,
       @apply_url, @announce_url, @written_test, @notes, @source, @is_verified, @is_hot, @timeline)
  `);

  const write = db.transaction(() => {
    db.prepare('DELETE FROM campus_schedules WHERE source IN (?, ?)').run(SOURCE, '椋炰功鏍℃嫑鏃ュ巻');
    deduped.forEach(record => insert.run(record));
  });
  write();

  const total = db.prepare('SELECT COUNT(*) AS c FROM campus_schedules').get().c;
  console.log('\n✅ 同步完成');
  console.log(`   有效记录:       ${records.length} 条`);
  console.log(`   去重后写入:     ${deduped.length} 条`);
  console.log(`   无效/说明记录:  ${items.length - records.length} 条`);
  console.log(`   数据库总计:     ${total} 条`);
}

main().catch((err) => {
  console.error('❌ 同步失败:', err.message);
  process.exit(1);
});
