const router = require('express').Router();
const { aiLimiter } = require('../middleware/rateLimit');
const { authMiddleware } = require('../middleware/auth');
const { consumeDailyLimit, requireVip } = require('../utils/aiQuota');
const { createChatCompletion, streamChatCompletion } = require('../utils/aiClient');
const db     = require('../db/database');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isVipActive(user) {
  if (!user || user.vip_level <= 0) return false;
  if (!user.vip_expires_at) return true;
  return String(user.vip_expires_at).slice(0, 10) >= todayKey();
}

function aiFail(res, status, message, data) {
  return res.status(status).json({ code: -1, message, data });
}

function aiErrorResponse(res, err, scope) {
  const status = err.response?.status || 500;
  console.error(`[ai/${scope}]`, status, err.message);
  if (err.code === 'AI_CONFIG_MISSING') {
    return aiFail(res, 503, 'AI服务未配置，请稍后再试', { reason: 'config_missing' });
  }
  if (err.code === 'ECONNABORTED' || /timeout|超时/i.test(err.message)) {
    return aiFail(res, 504, 'AI响应超时，请重试', { reason: 'timeout' });
  }
  if (status === 402) {
    return aiFail(res, 402, 'AI服务额度不足，请稍后再试', { reason: 'upstream_balance' });
  }
  return aiFail(res, status, 'AI服务异常，请稍后重试', { reason: 'upstream_error' });
}

function extractJsonObject(content) {
  const cleaned = String(content || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    return null;
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validateCareerPlan(plan) {
  return !!(
    plan &&
    typeof plan === 'object' &&
    plan.gap_analysis &&
    Array.isArray(plan.phases) &&
    plan.phases.length > 0 &&
    Array.isArray(plan.resources) &&
    Array.isArray(plan.milestones)
  );
}

function validateProject(project) {
  return !!(
    project &&
    typeof project.title === 'string' &&
    typeof project.background === 'string' &&
    typeof project.methodology === 'string' &&
    isStringArray(project.data_sources) &&
    isStringArray(project.tech_stack) &&
    isStringArray(project.key_results) &&
    typeof project.resume_bullet === 'string'
  );
}

function validateWorkflowResult(result) {
  const intents = new Set(['resume', 'jobs', 'interview', 'applications', 'career_plan', 'agencies', 'campus', 'salary', 'general']);
  return !!(
    result &&
    typeof result.reply === 'string' &&
    intents.has(result.intent) &&
    Array.isArray(result.actions) &&
    Array.isArray(result.suggestions)
  );
}

// ── AI 求职助手 System Prompt ──────────────────────────────
const ASSISTANT_SYSTEM = `你是"职引"平台的首席 AI 职业导师，专为留学生群体提供专业的求职全程支持。

## 身份定位
你的名字是「职引导师」。你深度了解海内外知名企业（Google、Meta、字节跳动、腾讯、麦肯锡等）的招聘偏好与面试流程，曾帮助大量留学生成功拿到理想 Offer。

## 四大核心能力

**1. 简历深度诊断与润色**
分析 ATS 关键词匹配度，识别弱动词（如 assisted、helped）并替换为量化影响力的强表达；基于目标 JD 定制简历措辞，突出可迁移技能与差异化优势。

**2. 精准岗位匹配**
结合用户背景（专业/经验/技能）推荐最适配的岗位方向，指出竞争力盲点，提供 Target / Reach / Safe 三层梯次投递策略。

**3. 结构化面试模拟**
使用 STAR 法则（Situation, Task, Action, Result）拆解行为面试题；模拟算法题、System Design、PM Case 等场景，给出具体答题框架与针对性反馈。

**4. 系统化职业规划**
制定 3/6/12 个月求职里程碑与技能提升路径，梳理校招截止日期与内推时间窗口。

## 回复原则
- 专业且有共情力：理解留学生求职的焦虑（签证、文化差异、时差等特殊性）
- 每次回复至少包含 1 条可立即执行的具体建议（Actionable Advice）
- 简洁有力：核心内容控制在 300 字以内，重要信息用列表呈现，避免废话套话
- 遇到非求职问题，礼貌引导回主题："这超出了我的专长范围，不过在求职准备方面……"`;

// ── AI 求职助手对话（SSE 流式输出） ────────────────
// POST /api/ai/assistant
// Body: { messages: [{role, content}], userContext?: {...} }
router.post('/assistant', authMiddleware, aiLimiter, async (req, res) => {
  const { messages, userContext } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return aiFail(res, 400, 'messages 不能为空');
  }
  if (messages.length > 40) {
    return aiFail(res, 400, '消息轮数不能超过 40');
  }
  for (const m of messages) {
    if (typeof m.content !== 'string' || m.content.length > 4000) {
      return aiFail(res, 400, '单条消息不能超过 4000 字符');
    }
  }
  if (!consumeDailyLimit(req, res, 'assistant')) return;

  // 将用户画像动态注入 system prompt，实现个性化建议
  const safe = (v, max) => String(v || '').trim().slice(0, max);
  let systemContent = ASSISTANT_SYSTEM;
  if (userContext && typeof userContext === 'object') {
    const parts = [];
    if (safe(userContext.nickname, 20))   parts.push('用户昵称：'   + safe(userContext.nickname, 20));
    if (safe(userContext.targetJob, 50))  parts.push('目标岗位：'   + safe(userContext.targetJob, 50));
    if (safe(userContext.location, 30))   parts.push('目标地区：'   + safe(userContext.location, 30));
    if (safe(userContext.education, 30))  parts.push('学历背景：'   + safe(userContext.education, 30));
    if (userContext.hasResume)            parts.push('已完善简历信息');
    const appCnt = parseInt(userContext.appCount) || 0;
    if (appCnt > 0)                       parts.push(`进行中投递：${appCnt} 条`);
    if (parts.length > 0) {
      systemContent += '\n\n---\n当前用户信息（请结合以下信息给出个性化建议）：\n' + parts.join('\n');
    }
  }

  const fullMessages = [
    { role: 'system', content: systemContent },
    ...messages.slice(-20)
  ];

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲
  res.flushHeaders();

  try {
    const streamRes = await streamChatCompletion(
      { messages: fullMessages, temperature: 0.7, stream: true },
      { timeout: 60000 }
    );

    let clientClosed = false;
    let streamEnded = false;

    // 直接将上游 SSE 流透传给客户端
    streamRes.data.on('data', (chunk) => { res.write(chunk); });
    streamRes.data.on('end',  () => {
      streamEnded = true;
      res.end();
    });
    streamRes.data.on('error', (err) => {
      console.error('[ai/assistant] stream error:', err.message);
      if (clientClosed || res.writableEnded) return;
      try {
        res.write(`data: ${JSON.stringify({ error: 'AI响应中断，请重试' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (e) {}
    });

    // 客户端断开时终止上游请求
    req.on('close', () => {
      clientClosed = !streamEnded;
      if (!streamEnded) streamRes.data.destroy();
    });

  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[ai/assistant]', status, err.message);
    if (!res.headersSent) {
      return aiErrorResponse(res, err, 'assistant');
    }
    try {
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        res.write(`data: ${JSON.stringify({ error: 'AI响应超时，请重试' })}\n\n`);
      } else if (status === 402) {
        res.write(`data: ${JSON.stringify({ error: 'DeepSeek余额不足，请稍后再试' })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ error: '服务异常，请稍后重试' })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (e) {}
  }
});

// ── AI 对话（面试/面经/题库生成） ────────────────
// POST /api/ai/chat
// Body: { messages: [...], temperature: 0.7 }
router.post('/chat', authMiddleware, aiLimiter, async (req, res) => {
  const { messages, temperature } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return aiFail(res, 400, 'messages 不能为空');
  }
  if (messages.length > 50) {
    return aiFail(res, 400, '消息轮数不能超过 50');
  }
  for (const m of messages) {
    if (typeof m.content !== 'string' || m.content.length > 4000) {
      return aiFail(res, 400, '单条消息不能超过 4000 字符');
    }
  }

  try {
    const result = await createChatCompletion(
      {
        messages,
        temperature: temperature ?? 0.7,
        stream: false
      },
      {
        timeout: 60000   // AI 生成最长等 60 秒
      }
    );
    res.json(result.data);
  } catch (err) {
    aiErrorResponse(res, err, 'chat');
  }
});

// ── 求职路线规划 ──────────────────────────────
// POST /api/ai/career-plan
// Body: { location, position, background }
router.post('/career-plan', authMiddleware, aiLimiter, async (req, res) => {
  const { location, position, background } = req.body;
  if (!position || !background) {
    return aiFail(res, 400, '目标岗位和个人背景不能为空');
  }
  if (position.length > 200 || background.length > 2000) {
    return aiFail(res, 400, '输入内容过长');
  }
  if (!consumeDailyLimit(req, res, 'career_plan')) return;

  const prompt = `你是留学生求职顾问。根据以下信息，用JSON返回求职路线规划，不要有任何JSON以外的内容。

用户：地区=${location || '不限'}，岗位=${position}，背景=${background}

JSON结构（每个字符串字段控制在20字以内，数组最多3项）：
{"gap_analysis":{"core_skills":["技能1","技能2","技能3"],"gaps":["差距1","差距2"],"strengths":["优势1","优势2"]},"phases":[{"duration":"3个月","goal":"目标一句话","skills":["技能1","技能2"],"projects":["项目1"],"resume":"简历要点","interview":"面试策略","job_search":"求职策略"},{"duration":"6个月","goal":"","skills":[],"projects":[],"resume":"","interview":"","job_search":""},{"duration":"12个月","goal":"","skills":[],"projects":[],"resume":"","interview":"","job_search":""}],"resources":[{"category":"技术提升","items":["资源1","资源2"]},{"category":"求职平台","items":["平台1","平台2"]}],"milestones":[{"month":1,"focus":"启动重心一句话","actions":["具体行动1","具体行动2"]},{"month":2,"focus":"重心","actions":["行动1","行动2"]},{"month":3,"focus":"重心","actions":["行动1","行动2"]},{"month":6,"focus":"重心","actions":["行动1","行动2"]},{"month":9,"focus":"重心","actions":["行动1","行动2"]},{"month":12,"focus":"重心","actions":["行动1","行动2"]}]}`;

  try {
    const result = await createChatCompletion(
      {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 2000,
        stream: false
      },
      {
        timeout: 120000
      }
    );

    const content = result.data?.choices?.[0]?.message?.content || '';
    const plan = extractJsonObject(content);

    if (!validateCareerPlan(plan)) {
      return aiFail(res, 502, 'AI返回格式异常，请重试', { reason: 'schema_invalid' });
    }
    res.json({ plan, raw: content });
  } catch (err) {
    aiErrorResponse(res, err, 'career-plan');
  }
});

// ── AI 项目生成器 ──────────────────────────────
// POST /api/ai/project-builder
// Body: { track, role, background, seniority }
router.post('/project-builder', authMiddleware, aiLimiter, async (req, res) => {
  const { track, role, background, seniority } = req.body;
  if (!track) {
    return aiFail(res, 400, '请选择项目方向');
  }

  const trackMap = {
    data: 'Data（数据分析/BI/机器学习）',
    pm: 'PM（产品经理/产品运营）',
    tech: 'Tech（前端/后端/全栈开发）',
    consulting: 'Consulting（战略/管理咨询）',
    marketing: 'Marketing（市场营销/增长运营）',
    ops: 'Ops（运营/项目管理/供应链）'
  };

  const prompt = `你是一位资深求职顾问，专门帮助留学生生成真实可信的简历项目经历。

方向：${trackMap[track] || track}
目标岗位：${role || '不限'}
背景：${background || '留学生，无特殊说明'}
级别：${seniority || '应届'}

要求：
1. 项目必须真实可信，有具体行业场景和可落地的工作内容
2. 关键结果必须包含具体数字（如提升20%、覆盖10万用户、节省30小时/周）
3. 项目难度和技术栈适合该级别
4. 数据来源要真实（如政府数据库、公开API、爬虫、内部CRM等）
5. 只输出JSON，不含任何JSON以外的内容

{"title":"项目标题（10字以内）","background":"项目背景（2-3句，说明项目场景、业务问题、你的角色）","methodology":"核心方法（2-3句，使用的方法论/框架/分析流程）","data_sources":["来源1","来源2"],"tech_stack":["技术或工具1","技术或工具2","技术或工具3","技术或工具4"],"key_results":["量化成果1（含具体数字）","量化成果2（含具体数字）","量化成果3（含具体数字）"],"resume_bullet":"一行简历描述（含数字，30字以内，适合直接放入简历）","duration":"项目周期（如：2个月）"}`;

  try {
    const result = await createChatCompletion(
      {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 1200,
        stream: false
      },
      {
        timeout: 90000
      }
    );

    const content = result.data?.choices?.[0]?.message?.content || '';
    const project = extractJsonObject(content);

    if (!validateProject(project)) {
      return aiFail(res, 502, 'AI返回格式异常，请重试', { reason: 'schema_invalid' });
    }
    res.json({ project });
  } catch (err) {
    aiErrorResponse(res, err, 'project-builder');
  }
});

// ── AI 求职工作流 ────────────────────────────────────────────────────────────
// POST /api/ai/workflow
// Body: { message: string, history: [{role,content}] }
// Returns: { reply, actions, intent }
const WORKFLOW_SYSTEM = `你是"智引求职助手"，一个专为留学生设计的智能求职 AI。

你能调度以下功能模块（每次回复时按需推荐相关操作）：
- resume: 简历诊断与优化（分析ATS得分、关键词建议）
- jobs: 职位搜索与推荐（按岗位/地区/行业筛选）
- applications: 网申记录与投递追踪
- interview: AI模拟面试（根据岗位生成题目、实时打分）
- career_plan: 3/6/12个月求职规划
- agencies: 求职机构测评（猎头、培训机构推荐）
- campus: 校招日历（截止日期、投递时间线）
- salary: 薪酬查询（岗位薪资范围对比）

每次回复必须返回合法 JSON，格式如下（不要输出JSON以外的任何内容）：
{
  "reply": "对用户的自然语言回复，100字以内，亲切专业",
  "intent": "resume|jobs|interview|applications|career_plan|agencies|campus|salary|general",
  "actions": [
    { "label": "按钮文字，6字以内", "module": "模块名", "params": {} }
  ],
  "suggestions": ["下一步建议1（10字以内）", "下一步建议2", "下一步建议3"]
}

rules:
- actions 最多3个，只推荐最相关的
- 如果意图不明确，intent 用 general，不推荐 actions，只给 suggestions 引导用户
- 不要重复上下文已有内容
- 简历相关问题必须推荐 resume 模块
- 投递相关必须推荐 applications 模块`;

router.post('/workflow', authMiddleware, aiLimiter, requireVip('AI 工作流'), async (req, res) => {
  const { message, history = [], userContext } = req.body;
  if (!message || typeof message !== 'string' || message.length > 500) {
    return aiFail(res, 400, '消息不合法');
  }

  // 将用户背景信息拼入 system prompt
  let systemContent = WORKFLOW_SYSTEM;
  if (userContext) {
    const parts = [];
    if (userContext.nickname) parts.push(`用户昵称：${userContext.nickname}`);
    if (userContext.targetJob)  parts.push(`目标岗位：${userContext.targetJob}`);
    if (userContext.location)   parts.push(`目标地区：${userContext.location}`);
    if (userContext.education)  parts.push(`学历背景：${userContext.education}`);
    if (userContext.hasResume)  parts.push(`已上传简历：是`);
    if (userContext.appCount)   parts.push(`进行中投递：${userContext.appCount}条`);
    if (parts.length) systemContent += '\n\n当前用户信息：\n' + parts.join('\n');
  }

  const messages = [
    { role: 'system', content: systemContent },
    ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ];

  try {
    const result = await createChatCompletion(
      { messages, temperature: 0.6, stream: false },
      {
        timeout: 30000
      }
    );

    const raw = result.data.choices[0].message.content.trim();
    const parsed = extractJsonObject(raw);
    if (!validateWorkflowResult(parsed)) {
      return aiFail(res, 502, 'AI返回格式异常，请重试', { reason: 'schema_invalid' });
    }
    res.json(parsed);
  } catch (err) {
    aiErrorResponse(res, err, 'workflow');
  }
});

// ── ATS 简历优化 ────────────────────────────────────────────────────────────
// POST /api/ai/ats
// Body: { resumeData: object, jobDescription: string, jobTitle?: string }
// Returns: { atsScore, matchedKeywords, missingKeywords, sectionSuggestions, formatIssues, overallAdvice }
const ATS_DAILY_LIMIT = 3;

router.post('/ats', authMiddleware, aiLimiter, async (req, res) => {
  const { resumeData, jobDescription, jobTitle } = req.body;

  if (!resumeData || typeof resumeData !== 'object') {
    return aiFail(res, 400, '简历数据不能为空');
  }
  if (!jobDescription || typeof jobDescription !== 'string' || jobDescription.trim().length < 20) {
    return aiFail(res, 400, '岗位描述至少20字');
  }
  if (jobDescription.length > 5000) {
    return aiFail(res, 400, '岗位描述不能超过5000字');
  }

  // 配额检查（免费3次/天，VIP无限）
  const userId = req.user && req.user.userId;
  const user   = db.prepare('SELECT vip_level, vip_expires_at FROM users WHERE id = ?').get(userId);
  const vipOk  = isVipActive(user);
  if (!vipOk) {
    const day  = new Date().toISOString().slice(0, 10);
    const used = db.prepare(
      `SELECT COALESCE(SUM(count),0) AS n FROM ai_usage WHERE user_id=? AND feature='ats' AND usage_date=?`
    ).get(userId, day).n;
    if (used >= ATS_DAILY_LIMIT) {
      return res.status(429).json({
        code: -1,
        message: `ATS优化今日免费次数(${ATS_DAILY_LIMIT}次)已用完，开通VIP可无限使用`,
        data: { feature: 'ats', limit: ATS_DAILY_LIMIT, used, vipRequired: true }
      });
    }
    db.prepare(`
      INSERT INTO ai_usage (user_id, feature, usage_date, count, updated_at)
      VALUES (?, 'ats', ?, 1, datetime('now'))
      ON CONFLICT(user_id, feature, usage_date)
      DO UPDATE SET count = count + 1, updated_at = datetime('now')
    `).run(userId, day);
  }

  // 精简简历数据，控制 token 量
  const r = resumeData;
  const slim = {
    basicInfo:  r.basicInfo  || {},
    summary:    (r.summary   || '').slice(0, 500),
    skills:     (r.skills    || []).slice(0, 30),
    workExp:    (r.workExp   || []).slice(0, 5).map(w => ({
      company: w.company, role: w.role,
      desc: (w.desc || '').slice(0, 400)
    })),
    education:  (r.education || []).slice(0, 3).map(e => ({
      school: e.school, degree: e.degree, major: e.major
    })),
    projects:   (r.projects  || []).slice(0, 4).map(p => ({
      name: p.name || p.title,
      desc: (p.desc || p.description || '').slice(0, 300)
    }))
  };

  const prompt = `你是资深ATS系统专家和简历优化顾问。请对以下简历与岗位描述进行深度匹配分析，严格只输出JSON，不含任何其他内容。

目标岗位：${jobTitle || '未指定'}
岗位描述：
${jobDescription.slice(0, 3000)}

简历数据（JSON）：
${JSON.stringify(slim)}

返回格式（严格遵守，字符串用中文）：
{
  "ats_score": <0-100整数，综合ATS友好度>,
  "jd_match": <0-100整数，与JD的匹配程度>,
  "matched_keywords": ["已有关键词1","已有关键词2",...],
  "missing_keywords": [{"word":"缺失关键词","priority":"high|medium|low","suggestion":"在哪个板块补充"},...],
  "section_suggestions": [
    {"section":"summary|workExp|skills|projects|education","issue":"问题描述（20字内）","fix":"具体修改建议（40字内）","priority":"high|medium|low"},
    ...
  ],
  "bullet_rewrites": [
    {"original":"原始描述（前60字）","rewritten":"优化后描述（含量化数据）","reason":"改进说明（20字内）"},
    ...
  ],
  "format_issues": ["格式问题1","格式问题2",...],
  "overall_advice": "最重要的一条改进建议（30字以内）"
}

要求：
- matched_keywords 最多8个，missing_keywords 最多6个
- section_suggestions 最多5条，按priority排序
- bullet_rewrites 选最弱的1-3条工作/项目描述重写
- format_issues 最多3条，没有格式问题则返回[]`;

  try {
    const result = await createChatCompletion(
      {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2500,
        stream: false
      },
      {
        timeout: 90000
      }
    );

    const content = result.data?.choices?.[0]?.message?.content || '';
    const data    = extractJsonObject(content);

    if (!data || typeof data.ats_score !== 'number') {
      console.error('[ai/ats] schema invalid:', content.slice(0, 300));
      return aiFail(res, 502, 'AI返回格式异常，请重试', { reason: 'schema_invalid' });
    }

    res.json({ code: 0, data });
  } catch (err) {
    aiErrorResponse(res, err, 'ats');
  }
});

// ── Networking 消息生成 ───────────────────────────────────────────────────────
// POST /api/ai/networking
// Body: { targetCompany, targetRole, senderBackground, recipientBackground,
//         platform: 'linkedin'|'email', tone: 'formal'|'casual', lang: 'zh'|'en' }
// Returns: { code:0, data: { linkedin, email, subject, tips } }
const NET_DAILY_LIMIT = 5;

router.post('/networking', authMiddleware, aiLimiter, async (req, res) => {
  const {
    targetCompany, targetRole, senderBackground,
    recipientBackground = '',
    platform = 'both',
    tone     = 'formal',
    lang     = 'zh',
  } = req.body;

  if (!targetCompany || !targetRole || !senderBackground) {
    return aiFail(res, 400, '目标公司、职位、个人背景不能为空');
  }
  if (targetCompany.length > 100 || targetRole.length > 100) {
    return aiFail(res, 400, '公司或职位名称过长');
  }
  if (senderBackground.length > 800 || recipientBackground.length > 600) {
    return aiFail(res, 400, '背景描述过长');
  }

  // 配额：免费5次/天，VIP无限
  const userId = req.user && req.user.userId;
  const user   = db.prepare('SELECT vip_level, vip_expires_at FROM users WHERE id = ?').get(userId);
  const vipOk  = isVipActive(user);
  if (!vipOk) {
    const day  = new Date().toISOString().slice(0, 10);
    const used = db.prepare(
      `SELECT COALESCE(SUM(count),0) AS n FROM ai_usage WHERE user_id=? AND feature='networking' AND usage_date=?`
    ).get(userId, day).n;
    if (used >= NET_DAILY_LIMIT) {
      return res.status(429).json({
        code: -1,
        message: `Networking消息今日免费次数(${NET_DAILY_LIMIT}次)已用完，开通VIP可无限使用`,
        data: { feature: 'networking', limit: NET_DAILY_LIMIT, used, vipRequired: true }
      });
    }
    db.prepare(`
      INSERT INTO ai_usage (user_id, feature, usage_date, count, updated_at)
      VALUES (?, 'networking', ?, 1, datetime('now'))
      ON CONFLICT(user_id, feature, usage_date)
      DO UPDATE SET count = count + 1, updated_at = datetime('now')
    `).run(userId, day);
  }

  const toneDesc = tone === 'casual' ? '轻松友好、亲切' : '专业得体、简洁有力';
  const langDesc = lang === 'en' ? '英文' : '中文';
  const recpDesc = recipientBackground ? `\n对方背景：${recipientBackground}` : '';

  const prompt = `你是顶级职业发展教练，专注帮助留学生建立人脉。请生成专业的 Networking 消息，只输出 JSON，不含任何其他内容。

信息：
- 目标公司：${targetCompany}
- 目标职位：${targetRole}
- 我的背景：${senderBackground}${recpDesc}
- 语气：${toneDesc}
- 语言：${langDesc}

输出格式（JSON，所有字段均为${langDesc}）：
{
  "linkedin_message": "LinkedIn 私信正文（150字以内，含称呼、自我介绍、目的、行动号召）",
  "email_subject": "邮件主题（20字以内，吸引眼球）",
  "email_body": "邮件正文（250字以内，结构：开场/自我介绍/为何联系/具体请求/结尾签名）",
  "cold_tips": ["发送时机建议（10字内）", "个性化建议（10字内）", "跟进策略（10字内）"],
  "key_hooks": ["消息中的核心亮点1（8字内）", "核心亮点2（8字内）"]
}`;

  try {
    const result = await createChatCompletion(
      {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.75,
        max_tokens: 1200,
        stream: false,
      },
      {
        timeout: 60000,
      }
    );

    const content = result.data?.choices?.[0]?.message?.content || '';
    const data    = extractJsonObject(content);

    if (!data || typeof data.linkedin_message !== 'string') {
      console.error('[ai/networking] schema invalid:', content.slice(0, 300));
      return aiFail(res, 502, 'AI返回格式异常，请重试', { reason: 'schema_invalid' });
    }

    res.json({ code: 0, data });
  } catch (err) {
    aiErrorResponse(res, err, 'networking');
  }
});

module.exports = router;
