/**
 * 飞书校招日历同步脚本
 * 从飞书多维表格拉取校招数据并导入 campus_schedules 表
 *
 * 用法：node scripts/sync_feishu_campus.js
 *
 * 飞书表: https://scngpvah6mts.feishu.cn/base/SAHbbOc68aH0sPscYu7cbKZjnnr?table=tblnJnFOgllO4FYe
 */

const { execSync } = require('child_process');
const db = require('../db/database');

const BASE_TOKEN = 'SAHbbOc68aH0sPscYu7cbKZjnnr';
const TABLE_ID   = 'tblnJnFOgllO4FYe';

// ── 字段位置映射（通过数据内容分析确认）─────────────────────────────────────
// [0]  公司名称
// [2]  公告链接（markdown格式 [text](url)）
// [4]  备注
// [6]  招聘类型（数组）
// [8]  公司行业（数组）
// [9]  开始时间（datetime string）
// [10] 岗位要求专业（AI分析文本）
// [11] 薪资
// [12] 投递链接（markdown格式，少量记录）
// [13] 是否免笔试（数组）
// [14] 截止日期（文本）
// [15] 工作地点（数组）

const INDUSTRY_MAP = {
  '互联网': '互联网', '科技': '互联网', 'IT': '互联网',
  '金融': '金融', '银行': '金融', '基金': '金融', '证券': '金融', '保险': '金融',
  '新能源': '新能源', '能源': '新能源', '电池': '新能源',
  '咨询': '咨询', '管理咨询': '咨询',
  '国央企': '国央企', '国企': '国央企', '央企': '国央企',
  '通信': '通信/硬件', '硬件': '通信/硬件', '芯片': '通信/硬件', '半导体': '通信/硬件',
  '外企': '其他', '制造': '其他', '消费': '其他', '医疗': '其他',
};

function mapIndustry(arr) {
  if (!arr || !arr.length) return '其他';
  const raw = arr[0];
  for (const [key, val] of Object.entries(INDUSTRY_MAP)) {
    if (raw.includes(key)) return val;
  }
  return arr[0] || '其他';
}

function mapRecruitType(arr) {
  if (!arr || !arr.length) return '秋招';
  const raw = arr[0];
  if (raw.includes('暑期实习') || raw.includes('实习')) return '暑期实习';
  if (raw.includes('春招')) return '春招';
  return '秋招'; // 提前批、秋招、正式批均归秋招
}

function extractGradYear(arr) {
  if (!arr || !arr.length) return 2026;
  const raw = arr[0];
  const m = raw.match(/(\d{2})届/);
  if (m) return 2000 + parseInt(m[1]);
  return 2026;
}

// 从 markdown 链接格式 [text](url) 提取 URL
function extractUrl(raw) {
  if (!raw) return '';
  // 格式: [https://...](https://...)
  const m = raw.match(/\[.*?\]\((https?:\/\/[^)]+)\)/);
  if (m) return m[1];
  // 纯 URL
  if (raw.startsWith('http')) return raw.trim();
  return '';
}

function parseDate(raw) {
  if (!raw) return '';
  // "2025-06-27 00:00:00" → "2025-06-27"
  return raw.split(' ')[0];
}

// ── 拉取所有记录（offset 分页）───────────────────────────────────────────────
function fetchAllRecords() {
  const all = [];
  const BATCH = 200;
  let offset = 0;
  let page = 1;

  while (true) {
    console.log(`  拉取第 ${page} 页 (offset=${offset})...`);
    const cmd = `lark-cli base +record-list --base-token ${BASE_TOKEN} --table-id ${TABLE_ID} --limit ${BATCH} --offset ${offset}`;

    let result;
    try {
      result = execSync(cmd, { encoding: 'utf8', timeout: 60000 });
    } catch (e) {
      console.error('  lark-cli 调用失败:', e.message);
      break;
    }

    const parsed = JSON.parse(result);
    if (!parsed.ok) {
      console.error('  API 错误:', parsed.error?.message);
      break;
    }

    const batch = parsed.data?.data || [];
    all.push(...batch);
    console.log(`  本页 ${batch.length} 条，累计 ${all.length} 条`);

    if (!parsed.data?.has_more || batch.length < BATCH) break;
    offset += BATCH;
    page++;
  }

  return all;
}

// ── 转换单条记录 ─────────────────────────────────────────────────────────────
function transformRecord(row) {
  const company = (row[0] || '').replace(/\n/g, '').trim();
  if (!company) return null;

  const announceUrl = extractUrl(row[2]);
  const notes       = (row[4] || '').trim();
  const recruitTypeRaw = row[6];
  const industryRaw    = row[8];
  const startDateRaw   = row[9];
  const positionName   = (row[10] || '').trim();
  const salary         = (row[11] || '').trim();
  const applyUrl       = extractUrl(row[12]);
  const writtenTestRaw = row[13];
  const deadlineDate   = (row[14] || '').trim();
  const locationsRaw   = row[15];

  const recruitType = mapRecruitType(recruitTypeRaw);
  const industry    = mapIndustry(industryRaw);
  const gradYear    = extractGradYear(recruitTypeRaw);
  const startDate   = parseDate(startDateRaw);
  const locations   = locationsRaw && locationsRaw.length ? JSON.stringify(locationsRaw) : '[]';

  let writtenTest = '需要笔试';
  if (writtenTestRaw && writtenTestRaw.some(v => v.includes('免笔试'))) {
    writtenTest = '免笔试';
  }

  // 把薪资合并到备注
  let fullNotes = notes;
  if (salary) fullNotes = fullNotes ? `${fullNotes}\n薪资：${salary}` : `薪资：${salary}`;

  return {
    company,
    region: '中国内地',
    position_type: '综合',
    recruit_year: 2025,
    grad_year: gradYear,
    recruit_type: recruitType,
    industry,
    start_date: startDate,
    deadline_date: deadlineDate,
    locations,
    position_name: positionName.slice(0, 500),
    apply_url: applyUrl,
    announce_url: announceUrl,
    written_test: writtenTest,
    notes: fullNotes.slice(0, 1000),
    source: '飞书校招日历',
    is_verified: 1,
    is_hot: 0,
    timeline: '[]',
  };
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
function main() {
  console.log('=== 飞书校招日历同步 ===');
  console.log('拉取飞书数据...');

  const rows = fetchAllRecords();
  console.log(`\n共获取 ${rows.length} 条原始记录`);

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

  // 用于去重：同公司+招聘类型只保留一条
  const checkExist = db.prepare(
    'SELECT id FROM campus_schedules WHERE company = ? AND recruit_type = ? AND source = ?'
  );

  let inserted = 0, skipped = 0, invalid = 0;

  const batchInsert = db.transaction((records) => {
    for (const rec of records) {
      const transformed = transformRecord(rec);
      if (!transformed) { invalid++; continue; }

      const existing = checkExist.get(transformed.company, transformed.recruit_type, '飞书校招日历');
      if (existing) { skipped++; continue; }

      insert.run(transformed);
      inserted++;
    }
  });

  batchInsert(rows);

  const total = db.prepare('SELECT COUNT(*) as c FROM campus_schedules').get().c;
  console.log(`\n✅ 同步完成`);
  console.log(`   新增: ${inserted} 条`);
  console.log(`   跳过（已存在）: ${skipped} 条`);
  console.log(`   无效（空公司名）: ${invalid} 条`);
  console.log(`   数据库总计: ${total} 条`);
}

main();
