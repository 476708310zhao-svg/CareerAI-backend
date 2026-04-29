/**
 * 飞书校招日历自动同步脚本（服务器版）
 * 使用飞书 REST API，不依赖 lark-cli，适合在服务器 cron 中运行
 *
 * 用法: node scripts/sync_feishu_server.js
 * 环境变量: FEISHU_APP_ID, FEISHU_APP_SECRET
 */

'use strict';

const https = require('https');
const db    = require('../db/database');

const APP_ID     = process.env.FEISHU_APP_ID     || 'cli_a94677d1f9f8dcd6';
const APP_SECRET = process.env.FEISHU_APP_SECRET  || 'lHPV5ws3AzQfyrFcuwJDYeRCz0uns1Zs';
const BASE_TOKEN = 'SAHbbOc68aH0sPscYu7cbKZjnnr';
const TABLE_ID   = 'tblnJnFOgllO4FYe';

// ── HTTP 工具 ─────────────────────────────────────────────────────────────────
function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── 获取 tenant_access_token ──────────────────────────────────────────────────
async function getAccessToken() {
  const res = await request({
    hostname: 'open.feishu.cn',
    path:     '/open-apis/auth/v3/tenant_access_token/internal',
    method:   'POST',
    headers:  { 'Content-Type': 'application/json' },
  }, { app_id: APP_ID, app_secret: APP_SECRET });

  if (res.code !== 0) throw new Error('获取 token 失败: ' + res.msg);
  return res.tenant_access_token;
}

// ── 拉取所有记录（page_token 分页）────────────────────────────────────────────
async function fetchAllRecords(token) {
  const all = [];
  let pageToken = '';
  let page = 1;

  while (true) {
    console.log(`  拉取第 ${page} 页...`);
    const qs = `page_size=500${pageToken ? '&page_token=' + pageToken : ''}`;
    const res = await request({
      hostname: 'open.feishu.cn',
      path:     `/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/records?${qs}`,
      method:   'GET',
      headers:  { 'Authorization': 'Bearer ' + token },
    });

    if (res.code !== 0) throw new Error('拉取记录失败: ' + res.msg);

    const items = res.data?.items || [];
    all.push(...items);
    console.log(`  本页 ${items.length} 条，累计 ${all.length} 条`);

    if (!res.data?.has_more) break;
    pageToken = res.data.page_token;
    page++;
  }

  return all;
}

// ── 字段值解析工具 ─────────────────────────────────────────────────────────────
function getText(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map(i => (typeof i === 'string' ? i : i?.text || i?.value || '')).join('、');
  if (typeof v === 'object') return (v.text || v.value || '').trim();
  return String(v).trim();
}

function getUrl(v) {
  if (!v) return '';
  if (typeof v === 'string') {
    const m = v.match(/\(https?:\/\/[^)]+\)/);
    if (m) return m[0].slice(1, -1);
    if (v.startsWith('http')) return v.trim();
    return '';
  }
  if (typeof v === 'object') return v.link || v.url || '';
  return '';
}

function getArr(v) {
  if (!Array.isArray(v)) return [];
  return v.map(i => (typeof i === 'string' ? i : i?.text || i?.value || '')).filter(Boolean);
}

function parseDate(v) {
  if (!v) return '';
  // 数字时间戳（毫秒）
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
  // 字符串
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.trim();
}

const INDUSTRY_MAP = {
  '互联网': '互联网', '科技': '互联网', 'IT': '互联网',
  '金融': '金融', '银行': '金融', '基金': '金融', '证券': '金融', '保险': '金融',
  '新能源': '新能源', '能源': '新能源', '电池': '新能源',
  '咨询': '咨询', '管理咨询': '咨询',
  '国央企': '国央企', '国企': '国央企', '央企': '国央企',
  '通信': '通信/硬件', '硬件': '通信/硬件', '芯片': '通信/硬件', '半导体': '通信/硬件',
};

function mapIndustry(arr) {
  if (!arr.length) return '其他';
  const raw = arr[0];
  for (const [k, v] of Object.entries(INDUSTRY_MAP)) {
    if (raw.includes(k)) return v;
  }
  return arr[0] || '其他';
}

function mapRecruitType(arr) {
  if (!arr.length) return '秋招';
  const raw = arr[0];
  if (raw.includes('暑期实习') || raw.includes('实习')) return '暑期实习';
  if (raw.includes('春招')) return '春招';
  return '秋招';
}

function extractGradYear(arr) {
  if (!arr.length) return 2026;
  const m = arr[0].match(/(\d{2})届/);
  return m ? 2000 + parseInt(m[1]) : 2026;
}

// ── 转换单条飞书记录 ──────────────────────────────────────────────────────────
function transform(item) {
  const f = item.fields || {};

  // 字段名兼容：优先用中文字段名，找不到就按位置降级
  const company      = getText(f['公司名称'] || f['企业名称'] || '');
  if (!company) return null;

  const announceUrl  = getUrl(f['公告链接'] || f['官网链接'] || '');
  const notes        = getText(f['备注'] || '');
  const recruitArr   = getArr(f['招聘类型'] || f['类型'] || []);
  const industryArr  = getArr(f['公司行业'] || f['行业'] || []);
  const startDateRaw = f['开始时间'] || f['开始日期'] || '';
  const positionName = getText(f['岗位要求专业'] || f['岗位'] || '');
  const salary       = getText(f['薪资'] || '');
  const applyUrl     = getUrl(f['投递链接'] || f['投递地址'] || '');
  const writtenArr   = getArr(f['是否免笔试'] || []);
  const deadlineRaw  = f['截止日期'] || f['截止时间'] || '';
  const locArr       = getArr(f['工作地点'] || f['地点'] || []);

  const recruitType  = mapRecruitType(recruitArr);
  const industry     = mapIndustry(industryArr);
  const gradYear     = extractGradYear(recruitArr);
  const startDate    = parseDate(startDateRaw);
  const deadlineDate = parseDate(deadlineRaw);
  const locations    = JSON.stringify(locArr);
  const writtenTest  = writtenArr.some(v => v.includes('免笔试')) ? '免笔试' : '需要笔试';
  const fullNotes    = salary ? (notes ? `${notes}\n薪资：${salary}` : `薪资：${salary}`) : notes;

  return {
    company,
    region:        '中国内地',
    position_type: '综合',
    recruit_year:  2025,
    grad_year:     gradYear,
    recruit_type:  recruitType,
    industry,
    start_date:    startDate,
    deadline_date: deadlineDate,
    locations,
    position_name: positionName.slice(0, 500),
    apply_url:     applyUrl,
    announce_url:  announceUrl,
    written_test:  writtenTest,
    notes:         fullNotes.slice(0, 1000),
    source:        '飞书校招日历',
    is_verified:   1,
    is_hot:        0,
    timeline:      '[]',
  };
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== 飞书校招日历同步（服务器版）===');
  console.log(new Date().toLocaleString('zh-CN'));

  console.log('\n1. 获取飞书访问令牌...');
  const token = await getAccessToken();
  console.log('   ✓ 令牌获取成功');

  console.log('\n2. 拉取飞书数据...');
  const items = await fetchAllRecords(token);
  console.log(`   共获取 ${items.length} 条原始记录`);

  console.log('\n3. 写入数据库...');
  const insert = db.prepare(`
    INSERT OR IGNORE INTO campus_schedules
      (company, region, position_type, recruit_year, grad_year, recruit_type,
       industry, start_date, deadline_date, locations, position_name,
       apply_url, announce_url, written_test, notes, source, is_verified, is_hot, timeline)
    VALUES
      (@company, @region, @position_type, @recruit_year, @grad_year, @recruit_type,
       @industry, @start_date, @deadline_date, @locations, @position_name,
       @apply_url, @announce_url, @written_test, @notes, @source, @is_verified, @is_hot, @timeline)
  `);

  const checkExist = db.prepare(
    'SELECT id FROM campus_schedules WHERE company = ? AND recruit_type = ? AND source = ?'
  );

  let inserted = 0, skipped = 0, invalid = 0;

  const batchInsert = db.transaction(records => {
    for (const item of records) {
      const rec = transform(item);
      if (!rec) { invalid++; continue; }
      if (checkExist.get(rec.company, rec.recruit_type, '飞书校招日历')) { skipped++; continue; }
      insert.run(rec);
      inserted++;
    }
  });

  batchInsert(items);

  const { c: total } = db.prepare('SELECT COUNT(*) as c FROM campus_schedules').get();
  console.log(`\n✅ 同步完成`);
  console.log(`   新增:           ${inserted} 条`);
  console.log(`   跳过（已存在）: ${skipped} 条`);
  console.log(`   无效（空公司）: ${invalid} 条`);
  console.log(`   数据库总计:     ${total} 条`);
}

main().catch(err => {
  console.error('❌ 同步失败:', err.message);
  process.exit(1);
});
