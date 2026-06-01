const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

const { parseId } = require('../db/utils');
const { formatExperience: format } = require('../db/formatters');
const { parsePage, pageResult } = require('../db/paginate');

const curatedExperiences = [
  {
    id: 900001,
    user_id: 0,
    user_name: 'CareerAI 编辑部',
    user_avatar: '',
    company: 'Google',
    position: 'Software Engineer',
    type: '技术面试',
    round: 'Virtual Onsite',
    title: 'Google SWE New Grad VO 复盘：算法沟通和边界测试很关键',
    content: '四轮面试以算法和行为面为主。每道题都要先澄清输入输出、讲清思路，再写代码。面试官很看重测试用例、复杂度分析和卡住时的沟通方式。建议准备数组、图、动态规划、字符串和系统化 BQ 故事。',
    tags: JSON.stringify(['算法', 'BQ', 'New Grad', '北美']),
    likes_count: 186,
    comments_count: 24,
    is_anonymous: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 900002,
    user_id: 0,
    user_name: '匿名同学',
    user_avatar: '',
    company: 'Meta',
    position: 'Frontend Engineer',
    type: '技术面试',
    round: '二面',
    title: 'Meta 前端岗二面：React 状态管理、性能优化和手写组件',
    content: '面试从项目深挖开始，重点问到组件拆分、状态管理、首屏性能、列表虚拟化和错误边界。代码题偏实用，需要写一个可复用的搜索筛选组件，并讨论防抖、可访问性和测试。',
    tags: JSON.stringify(['Frontend', 'React', 'Performance', 'System Design']),
    likes_count: 142,
    comments_count: 18,
    is_anonymous: 1,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 900003,
    user_id: 0,
    user_name: '数据求职观察',
    user_avatar: '',
    company: 'Amazon',
    position: 'Data Analyst',
    type: 'SQL 面试',
    round: '一面',
    title: 'Amazon DA 一面：SQL 漏斗分析和 Leadership Principles',
    content: 'SQL 题围绕用户转化漏斗、留存和窗口函数展开。BQ 重点考察 Ownership、Dive Deep 和 Deliver Results。建议准备 STAR 故事，并能把业务指标拆成可验证的查询。',
    tags: JSON.stringify(['SQL', '数据分析', 'BQ', 'Amazon LP']),
    likes_count: 121,
    comments_count: 15,
    is_anonymous: 0,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 900004,
    user_id: 0,
    user_name: '产品转码同学',
    user_avatar: '',
    company: 'Microsoft',
    position: 'Product Manager',
    type: '产品面试',
    round: '三面',
    title: 'Microsoft PM 面试：产品 Sense、优先级和跨团队协作',
    content: '问题包括如何为 Teams 设计学生协作功能、如何定义成功指标、如何处理工程资源冲突。回答要展示用户分层、需求优先级、实验设计和跨团队推进能力。',
    tags: JSON.stringify(['PM', 'Product Sense', 'Metrics', 'Collaboration']),
    likes_count: 97,
    comments_count: 11,
    is_anonymous: 1,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 900005,
    user_id: 0,
    user_name: '金融校招复盘',
    user_avatar: '',
    company: 'Goldman Sachs',
    position: 'Investment Banking Analyst',
    type: 'Super Day',
    round: '终面',
    title: 'Goldman Sachs Super Day：估值基础、Deal 讨论和 Fit 面',
    content: '面试包含三轮 Fit 与 Technical。技术问题覆盖 DCF、可比公司、三张表联动和市场新闻。Fit 面会深挖为什么投行、为什么这个组、压力下如何协作。',
    tags: JSON.stringify(['Finance', 'IBD', 'Valuation', 'Fit']),
    likes_count: 88,
    comments_count: 9,
    is_anonymous: 0,
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: 900006,
    user_id: 0,
    user_name: '咨询面试笔记',
    user_avatar: '',
    company: 'McKinsey',
    position: 'Business Analyst',
    type: 'Case Interview',
    round: '一面',
    title: 'McKinsey BA Case：市场进入、结构化拆解和心算表达',
    content: 'Case 是新能源车市场进入，重点是先搭框架，再围绕市场规模、竞争、渠道和利润模型推进。PEI 问题围绕领导力和冲突处理，需要提前准备高密度故事。',
    tags: JSON.stringify(['Consulting', 'Case', 'PEI', 'Market Sizing']),
    likes_count: 76,
    comments_count: 7,
    is_anonymous: 0,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 900007,
    user_id: 0,
    user_name: '国内大厂同学',
    user_avatar: '',
    company: 'ByteDance',
    position: 'Backend Engineer',
    type: '技术面试',
    round: '二面',
    title: '字节后端二面：高并发、缓存一致性和项目追问',
    content: '一面偏基础，二面开始深挖项目。重点问 Redis 缓存击穿、消息队列可靠性、接口限流、数据库索引和线上故障排查。建议准备一个能讲清架构取舍的项目。',
    tags: JSON.stringify(['后端', 'Redis', '高并发', '项目深挖']),
    likes_count: 133,
    comments_count: 20,
    is_anonymous: 1,
    created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  },
  {
    id: 900008,
    user_id: 0,
    user_name: '算法岗复盘',
    user_avatar: '',
    company: 'Tencent',
    position: 'Machine Learning Engineer',
    type: '技术面试',
    round: '三面',
    title: '腾讯算法岗三面：推荐系统、特征工程和模型评估',
    content: '面试围绕推荐系统项目展开，追问召回、排序、特征穿越、冷启动、A/B Test 和指标选择。算法题不难，但需要把业务目标和模型指标讲清楚。',
    tags: JSON.stringify(['算法', '推荐系统', '机器学习', 'A/B Test']),
    likes_count: 109,
    comments_count: 13,
    is_anonymous: 1,
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
];

function rowMatches(row, { keyword, company, type }) {
  const keywordText = String(keyword || '').trim().toLowerCase();
  const companyText = String(company || '').trim().toLowerCase();
  const typeText = String(type || '').trim();

  if (companyText && !String(row.company || '').toLowerCase().includes(companyText)) return false;
  if (typeText && row.type !== typeText) return false;
  if (!keywordText) return true;

  return [row.title, row.company, row.position, row.content, row.round, row.type]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(keywordText));
}

function sortByCreatedAtDesc(a, b) {
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
}

router.get('/', (req, res) => {
  try {
    const { keyword, company, type } = req.query;
    const { page, pageSize, offset } = parsePage(req.query);
    let where = '1=1';
    const params = [];

    if (keyword) {
      where += ' AND (title LIKE ? OR company LIKE ? OR position LIKE ? OR content LIKE ?)';
      const k = `%${keyword}%`;
      params.push(k, k, k, k);
    }
    if (company) { where += ' AND company LIKE ?'; params.push(`%${company}%`); }
    if (type) { where += ' AND type = ?'; params.push(type); }

    const dbRows = db.prepare(`SELECT * FROM experiences WHERE ${where} ORDER BY created_at DESC`).all(...params);
    const curatedRows = curatedExperiences.filter((row) => rowMatches(row, { keyword, company, type }));
    const combinedRows = [...dbRows, ...curatedRows].sort(sortByCreatedAtDesc);
    const list = combinedRows.slice(offset, offset + pageSize).map(format);

    res.json({
      code: 0,
      message: 'success',
      data: {
        ...pageResult(list, combinedRows.length, page, pageSize),
        source: curatedRows.length ? 'database+curated' : 'database',
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

router.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

  const e = db.prepare('SELECT * FROM experiences WHERE id = ?').get(id)
    || curatedExperiences.find((item) => item.id === id);

  if (!e) return res.status(404).json({ code: -1, message: '面经不存在' });
  res.json({ code: 0, message: 'success', data: format(e) });
});

router.post('/', writeLimiter, authMiddleware, (req, res) => {
  try {
    const {
      company,
      position,
      type = '面试',
      round = '一面',
      title,
      content,
      tags = [],
      isAnonymous = false,
    } = req.body;

    if (!company || !title || !content) {
      return res.status(400).json({ code: -1, message: '公司、标题、内容不能为空' });
    }

    const user = db.prepare('SELECT nickname, avatar FROM users WHERE id = ?').get(req.user.userId);
    const result = db.prepare(`
      INSERT INTO experiences (user_id, user_name, user_avatar, company, position, type, round, title, content, tags, is_anonymous)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.userId,
      isAnonymous ? '匿名用户' : (user ? user.nickname : '用户'),
      isAnonymous ? '' : (user ? user.avatar : ''),
      company,
      position || '',
      type,
      round,
      title,
      content,
      JSON.stringify(tags),
      isAnonymous ? 1 : 0,
    );

    const e = db.prepare('SELECT * FROM experiences WHERE id = ?').get(result.lastInsertRowid);
    res.json({ code: 0, message: '发布成功', data: format(e) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: -1, message: '服务器内部错误' });
  }
});

router.post('/:id/like', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

  const e = db.prepare('SELECT id FROM experiences WHERE id = ?').get(id);
  if (!e) return res.status(404).json({ code: -1, message: '面经不存在' });

  const existing = db.prepare(
    'SELECT id FROM experience_likes WHERE experience_id = ? AND user_id = ?'
  ).get(id, req.user.userId);

  let isLiked;
  if (existing) {
    db.prepare('DELETE FROM experience_likes WHERE experience_id = ? AND user_id = ?')
      .run(id, req.user.userId);
    db.prepare('UPDATE experiences SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(id);
    isLiked = false;
  } else {
    db.prepare('INSERT INTO experience_likes (experience_id, user_id) VALUES (?, ?)')
      .run(id, req.user.userId);
    db.prepare('UPDATE experiences SET likes_count = likes_count + 1 WHERE id = ?').run(id);
    isLiked = true;
  }

  const { likes_count } = db.prepare('SELECT likes_count FROM experiences WHERE id = ?').get(id);
  res.json({ code: 0, data: { likesCount: likes_count, isLiked } });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: -1, message: '参数无效' });

  const e = db.prepare('SELECT * FROM experiences WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!e) return res.status(404).json({ code: -1, message: '面经不存在或无权限删除' });

  db.prepare('DELETE FROM experiences WHERE id = ?').run(id);
  res.json({ code: 0, message: '删除成功' });
});

module.exports = router;
