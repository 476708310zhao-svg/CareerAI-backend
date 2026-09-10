const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  PROMPT_VERSION,
  MIN_QUALITY_SCORE,
  buildCareerPlanMessages,
  buildCareerPlanExecutionMessages,
  buildRepairMessage,
  validateCareerPlan,
  assessCareerPlanQuality
} = require('../services/careerPlanGenerator');

function detailedPlan() {
  const phase = duration => ({
    duration,
    goal: `${duration}内形成可验证的岗位竞争力并完成目标投递`,
    skills: ['SQL', 'Python', '业务分析'],
    skill_actions: [
      { skill: 'SQL', target: '完成复杂查询', practice: '每周练习', evidence: '题解仓库' },
      { skill: 'Python', target: '独立分析数据', practice: '每周项目', evidence: '项目报告' }
    ],
    project_blueprints: [{ name: '业务分析项目', deliverable: '报告与看板', proof: '仓库和演示' }],
    deliverables: ['岗位版简历', '项目作品集'],
    success_metrics: ['完成30道题', '每周投递10个岗位'],
    resume: '围绕岗位关键词重写项目经历，并用数据说明分析结论和业务影响。',
    interview: '每周完成两次案例讲解并录音复盘，确保能在十分钟内解释项目取舍。',
    job_search: '按目标、匹配和保底三层建立公司池，每周跟踪投递、回复和面试转化率。'
  });
  return {
    prompt_version: PROMPT_VERSION,
    strategy_summary: '当前最优主线是先用可验证的数据项目补足经历证据，再同步启动分层投递，通过每周转化率决定技能训练和岗位范围的调整。',
    assumptions: ['每周可投入十小时'],
    gap_analysis: {
      core_skills: ['SQL', 'Python', '可视化'],
      gaps: ['缺少项目证据｜背景未体现作品｜先完成分析项目'],
      strengths: ['统计背景｜可转化为量化分析证据']
    },
    phases: [phase('3个月'), phase('6个月'), phase('12个月')],
    resources: [{ category: '技术提升', items: ['SQL题库｜练习查询｜每周10题'] }],
    milestones: [1, 2, 3, 6, 9, 12].map(month => ({
      month,
      focus: '形成可验证产出',
      actions: ['完成训练', '复盘投递'],
      deliverables: ['月度作品'],
      metrics: ['完成率80%']
    })),
    weekly_routine: ['能力', '项目', '投递', '面试'].map(category => ({ category, cadence: '每周2次', action: '完成固定动作', metric: '完成率80%' })),
    risk_alerts: ['项目拖延', '盲目海投', '面试复盘不足'].map(risk => ({ risk, signal: '连续两周无产出', response: '缩小范围并设置截止时间' }))
  };
}

test('career plan prompt requests evidence, metrics and execution rhythm instead of short keyword lists', () => {
  const messages = buildCareerPlanMessages({
    location: '美国',
    position: '数据分析师',
    background: '统计学本科，有课程项目'
  });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /掌握标准/);
  assert.match(messages[0].content, /project_blueprints/);
  assert.match(messages[0].content, /success_metrics/);
  assert.doesNotMatch(messages[0].content, /每个字符串字段控制在20字以内|数组最多3项/);
  assert.match(messages[1].content, /数据分析师/);

  const executionMessages = buildCareerPlanExecutionMessages({ location: '美国', position: '数据分析师' });
  assert.match(executionMessages[0].content, /milestones/);
  assert.match(executionMessages[0].content, /weekly_routine/);
  assert.match(executionMessages[0].content, /risk_alerts/);
});

test('career plan quality gate rejects sparse plans and accepts actionable plans', () => {
  const sparse = {
    strategy_summary: '先学习基础技能再开始投递',
    assumptions: [],
    gap_analysis: { core_skills: ['SQL'], gaps: ['经验少'], strengths: [] },
    phases: [
      { duration: '3个月', goal: '学习SQL' },
      { duration: '6个月', goal: '做项目' },
      { duration: '12个月', goal: '找工作' }
    ],
    resources: [],
    milestones: [],
    weekly_routine: [],
    risk_alerts: []
  };
  assert.equal(validateCareerPlan(sparse), true);
  assert.ok(assessCareerPlanQuality(sparse).score < MIN_QUALITY_SCORE);

  const detailed = detailedPlan();
  const quality = assessCareerPlanQuality(detailed);
  assert.equal(validateCareerPlan(detailed), true);
  assert.ok(quality.score >= MIN_QUALITY_SCORE);
  assert.deepEqual(quality.missing, []);
  assert.match(buildRepairMessage(assessCareerPlanQuality(sparse).missing), /技能行动不够具体/);
});

test('career plan route generates compact JSON parts in parallel', () => {
  const routeSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'ai.js'), 'utf8');
  assert.match(routeSource, /Promise\.all\(\[/);
  assert.match(routeSource, /buildCareerPlanExecutionMessages/);
  assert.match(routeSource, /thinking: \{ type: 'disabled' \}/);
  assert.match(routeSource, /response_format: \{ type: 'json_object' \}/);
  assert.match(routeSource, /generatePart\(coreMessages, 3000/);
  assert.match(routeSource, /generatePart\(executionMessages, 2200/);
});
