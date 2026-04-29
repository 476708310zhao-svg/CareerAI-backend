// utils/api-ai.js
// AI 功能模块：面试对话、题库生成、面经生成、求职规划

const { post } = require('./api-client.js');

/**
 * 发送消息给 AI（走自有服务器代理，失败自动重试一次）
 */
function sendChatToDeepSeek(messages, retries) {
  retries = retries === undefined ? 1 : retries;
  return post({
    path: '/api/ai/chat',
    body: { messages, temperature: 0.7 },
    timeout: 65000
  }).catch(err => {
    if (retries > 0) {
      console.warn('AI 请求失败，1秒后重试...', err.message || err);
      return new Promise(res => setTimeout(res, 1000))
        .then(() => sendChatToDeepSeek(messages, retries - 1));
    }
    return Promise.reject(err);
  });
}

/**
 * 从 DeepSeek 响应中提取并解析 JSON
 */
function _parseAiJson(res, type) {
  const content = (res && res.choices && res.choices[0] &&
    res.choices[0].message && res.choices[0].message.content) || '';
  try {
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
    const match = cleaned.match(pattern);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.error('AI JSON 解析失败:', e, '\n原文:', content.slice(0, 200));
  }
  return type === 'array' ? [] : null;
}

/**
 * AI 智能出题 - 按分类生成面试题
 */
function generateQuestions(category, count) {
  count = count || 3;
  const prompt = `请生成${count}道${category}方向的面试真题。要求：
1. 题目是企业真实面试中高频出现的
2. 难度分布：简单/中等/困难各占一部分
3. 每道题包含简洁的参考答案（100字以内）
4. 严格按以下JSON数组格式输出，不要输出任何JSON之外的内容：
[{"title":"题目内容","difficulty":"简单/中等/困难","answer":"参考答案"}]`;

  return sendChatToDeepSeek([
    { role: 'system', content: '你是一位资深技术面试官，精通各大厂面试题目。只输出JSON，不输出任何其他内容。' },
    { role: 'user', content: prompt }
  ]).then(res => _parseAiJson(res, 'array'));
}

/**
 * AI 生成单篇面经
 */
function generateExperience(company, position) {
  const posStr = position ? `${position}岗位` : '技术岗位';
  const prompt = `请为"${company}"公司的"${posStr}"生成一篇真实风格的面经分享。要求：
1. 包含面试流程、具体面试题目、面试体验和建议
2. 严格按以下JSON格式输出，不要输出任何JSON之外的内容：
{"title":"面经标题","type":"面试","round":"一面","content":"面经正文(300-500字，包含面试流程/真题/建议)","tags":["标签1","标签2","标签3"],"tips":"给后来人的3条建议"}`;

  return sendChatToDeepSeek([
    { role: 'system', content: '你是一位刚完成面试的求职者，分享真实面试经历。只输出JSON，不输出任何其他内容。' },
    { role: 'user', content: prompt }
  ]).then(res => _parseAiJson(res, 'object'));
}

/**
 * AI 批量生成多轮面经（一面/二面/三面/HR面）
 */
function generateBatchExperiences(company, position, rounds) {
  rounds = rounds || ['一面', '二面', 'HR面'];
  const posStr = position || '技术岗位';
  const roundsStr = rounds.join('、');

  const prompt = `请为"${company}"公司的"${posStr}"生成${rounds.length}篇面经分享，分别对应面试轮次：${roundsStr}。

每篇面经要求：
1. 每轮面试的侧重点不同（一面偏基础、二面偏项目深挖、HR面偏行为和文化）
2. 包含：面试形式（线上/现场）、时长、面试官身份、具体题目(3-5道)、面试体验、建议
3. 内容真实具体，有细节感

严格按以下JSON数组格式输出，不要输出任何JSON之外的内容：
[{"title":"面经标题","type":"面试","round":"轮次","duration":"面试时长","format":"面试形式","content":"面经正文(300-500字)","questions":["题目1","题目2"],"tags":["标签1","标签2"],"difficulty":"简单/中等/困难","result":"通过/等待/未通过","tips":"建议"}]`;

  return sendChatToDeepSeek([
    { role: 'system', content: '你是多位刚完成面试的求职者，分享在同一家公司不同轮次的真实面试经历。只输出JSON数组，不输出任何其他内容。' },
    { role: 'user', content: prompt }
  ]).then(res => _parseAiJson(res, 'array'));
}

/**
 * AI 生成特定公司的面试题库
 */
function generateCompanyQuestions(company, position, count) {
  count = count || 10;
  const posStr = position || '软件工程师';
  const prompt = `请生成${count}道"${company}"公司"${posStr}"岗位的高频面试真题。要求：
1. 涵盖算法编程、系统设计、项目经验、行为面试等多个维度
2. 基于该公司的真实面试风格（如Google注重算法、Amazon注重LP、字节注重项目深挖）
3. 每道题包含题目类型、难度和简要参考思路
4. 严格按以下JSON数组格式输出：
[{"title":"题目","type":"算法/系统设计/行为面试/项目经验","difficulty":"简单/中等/困难","hint":"解题思路(50字以内)"}]`;

  return sendChatToDeepSeek([
    { role: 'system', content: '你是一位熟悉各大厂面试风格的资深面试教练。只输出JSON，不输出任何其他内容。' },
    { role: 'user', content: prompt }
  ]).then(res => _parseAiJson(res, 'array'));
}

/**
 * 生成求职路线规划（走后端服务器）
 */
function generateCareerPlan(location, position, background) {
  return post({
    path: '/api/ai/career-plan',
    body: { location, position, background },
    timeout: 125000
  });
}

/**
 * AI 项目生成器
 * @param {string} track       - 方向：data / pm / tech / consulting / marketing / ops
 * @param {string} role        - 目标岗位（可选）
 * @param {string} background  - 用户背景（可选）
 * @param {string} seniority   - 级别：实习 / 应届 / 工作1-3年
 */
function generateProject(track, role, background, seniority) {
  return post({
    path: '/api/ai/project-builder',
    body: { track, role, background, seniority },
    timeout: 95000
  });
}

module.exports = {
  sendChatToDeepSeek,
  generateQuestions,
  generateExperience,
  generateBatchExperiences,
  generateCompanyQuestions,
  generateCareerPlan,
  generateProject
};
