const router = require('express').Router();
const axios  = require('axios');
const { aiLimiter } = require('../middleware/rateLimit');

const DEEPSEEK_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';

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
router.post('/assistant', aiLimiter, async (req, res) => {
  const { messages, userContext } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 不能为空' });
  }
  if (messages.length > 40) {
    return res.status(400).json({ error: '消息轮数不能超过 40' });
  }
  for (const m of messages) {
    if (typeof m.content !== 'string' || m.content.length > 4000) {
      return res.status(400).json({ error: '单条消息不能超过 4000 字符' });
    }
  }

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
    const streamRes = await axios.post(
      DEEPSEEK_URL,
      { model: 'deepseek-chat', messages: fullMessages, temperature: 0.7, stream: true },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: 60000
      }
    );

    // 直接将 DeepSeek SSE 流透传给客户端
    streamRes.data.on('data', (chunk) => { res.write(chunk); });
    streamRes.data.on('end',  () => { res.end(); });
    streamRes.data.on('error', (err) => {
      console.error('[ai/assistant] stream error:', err.message);
      try { res.write('data: [DONE]\n\n'); res.end(); } catch (e) {}
    });

    // 客户端断开时终止上游请求
    req.on('close', () => { streamRes.data.destroy(); });

  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[ai/assistant]', status, err.message);
    if (!res.headersSent) {
      return res.status(status).json({ error: err.message });
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
router.post('/chat', aiLimiter, async (req, res) => {
  const { messages, temperature } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 不能为空' });
  }
  if (messages.length > 50) {
    return res.status(400).json({ error: '消息轮数不能超过 50' });
  }
  for (const m of messages) {
    if (typeof m.content !== 'string' || m.content.length > 4000) {
      return res.status(400).json({ error: '单条消息不能超过 4000 字符' });
    }
  }

  try {
    const result = await axios.post(
      DEEPSEEK_URL,
      {
        model: 'deepseek-chat',
        messages,
        temperature: temperature ?? 0.7,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000   // AI 生成最长等 60 秒
      }
    );
    res.json(result.data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[ai/chat]', status, err.message);

    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return res.status(504).json({ error: 'AI响应超时，请重试' });
    }
    if (status === 402) {
      return res.status(402).json({ error: 'DeepSeek余额不足，请充值' });
    }
    res.status(status).json({ error: err.message });
  }
});

// ── 求职路线规划 ──────────────────────────────
// POST /api/ai/career-plan
// Body: { location, position, background }
router.post('/career-plan', aiLimiter, async (req, res) => {
  const { location, position, background } = req.body;
  if (!position || !background) {
    return res.status(400).json({ error: '目标岗位和个人背景不能为空' });
  }
  if (position.length > 200 || background.length > 2000) {
    return res.status(400).json({ error: '输入内容过长' });
  }

  const prompt = `你是留学生求职顾问。根据以下信息，用JSON返回求职路线规划，不要有任何JSON以外的内容。

用户：地区=${location || '不限'}，岗位=${position}，背景=${background}

JSON结构（每个字符串字段控制在20字以内，数组最多3项）：
{"gap_analysis":{"core_skills":["技能1","技能2","技能3"],"gaps":["差距1","差距2"],"strengths":["优势1","优势2"]},"phases":[{"duration":"3个月","goal":"目标一句话","skills":["技能1","技能2"],"projects":["项目1"],"resume":"简历要点","interview":"面试策略","job_search":"求职策略"},{"duration":"6个月","goal":"","skills":[],"projects":[],"resume":"","interview":"","job_search":""},{"duration":"12个月","goal":"","skills":[],"projects":[],"resume":"","interview":"","job_search":""}],"resources":[{"category":"技术提升","items":["资源1","资源2"]},{"category":"求职平台","items":["平台1","平台2"]}],"milestones":[{"month":1,"focus":"启动重心一句话","actions":["具体行动1","具体行动2"]},{"month":2,"focus":"重心","actions":["行动1","行动2"]},{"month":3,"focus":"重心","actions":["行动1","行动2"]},{"month":6,"focus":"重心","actions":["行动1","行动2"]},{"month":9,"focus":"重心","actions":["行动1","行动2"]},{"month":12,"focus":"重心","actions":["行动1","行动2"]}]}`;

  try {
    const result = await axios.post(
      DEEPSEEK_URL,
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 2000,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    );

    const content = result.data?.choices?.[0]?.message?.content || '';
    let plan = null;
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) plan = JSON.parse(match[0]);
    } catch (e) {
      console.error('[career-plan] JSON解析失败:', e.message);
    }

    if (!plan) {
      return res.status(500).json({ error: 'AI返回格式异常，请重试' });
    }
    res.json({ plan, raw: content });
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[ai/career-plan]', status, err.message);
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return res.status(504).json({ error: 'AI响应超时，请重试' });
    }
    if (status === 402) {
      return res.status(402).json({ error: 'DeepSeek余额不足，请充值' });
    }
    res.status(status).json({ error: err.message });
  }
});

// ── AI 项目生成器 ──────────────────────────────
// POST /api/ai/project-builder
// Body: { track, role, background, seniority }
router.post('/project-builder', aiLimiter, async (req, res) => {
  const { track, role, background, seniority } = req.body;
  if (!track) {
    return res.status(400).json({ error: '请选择项目方向' });
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
    const result = await axios.post(
      DEEPSEEK_URL,
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 1200,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 90000
      }
    );

    const content = result.data?.choices?.[0]?.message?.content || '';
    let project = null;
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) project = JSON.parse(match[0]);
    } catch (e) {
      console.error('[project-builder] JSON解析失败:', e.message);
    }

    if (!project) {
      return res.status(500).json({ error: 'AI返回格式异常，请重试' });
    }
    res.json({ project });
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[ai/project-builder]', status, err.message);
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return res.status(504).json({ error: 'AI响应超时，请重试' });
    }
    if (status === 402) {
      return res.status(402).json({ error: 'DeepSeek余额不足，请充值' });
    }
    res.status(status).json({ error: err.message });
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

router.post('/workflow', aiLimiter, async (req, res) => {
  const { message, history = [], userContext } = req.body;
  if (!message || typeof message !== 'string' || message.length > 500) {
    return res.status(400).json({ error: '消息不合法' });
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
    const result = await axios.post(
      DEEPSEEK_URL,
      { model: 'deepseek-chat', messages, temperature: 0.6, stream: false },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const raw = result.data.choices[0].message.content.trim();
    // 提取 JSON（防止模型输出多余文字）
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI未返回合法JSON');
    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error('[ai/workflow]', err.message);
    if (err.code === 'ECONNABORTED') return res.status(504).json({ error: 'AI响应超时' });
    if (status === 402) return res.status(402).json({ error: 'DeepSeek余额不足' });
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
