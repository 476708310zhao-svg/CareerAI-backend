#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');
const childProcess = require('child_process');
const AutomatorConnection = require('miniprogram-automator/out/Connection').default;
const AutomatorMiniProgram = require('miniprogram-automator/out/MiniProgram').default;

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const DEFAULT_REPORT_DIR = path.join(ROOT, 'reports', 'e2e-3.0');
const DEFAULT_TIMEOUT_MS = 15000;

const TAB_PAGES = new Set([
  'pages/index/index',
  'pages/jobs/jobs',
  'pages/experiences/experiences',
  'pages/campus/campus',
  'pages/profile/profile'
]);

function parseArgs(argv) {
  const options = {
    cliPath: process.env.WECHAT_DEVTOOLS_CLI || '',
    projectPath: process.env.MINIPROGRAM_PROJECT_PATH || MINI_ROOT,
    reportDir: DEFAULT_REPORT_DIR,
    screenshots: true,
    keepOpen: false,
    dryRun: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    trustProject: true,
    port: 0,
    verbose: false,
    freshDevtools: false,
    wsEndpoint: ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--cli-path') options.cliPath = next() || '';
    else if (arg.startsWith('--cli-path=')) options.cliPath = arg.slice('--cli-path='.length);
    else if (arg === '--project-path') options.projectPath = next() || '';
    else if (arg.startsWith('--project-path=')) options.projectPath = arg.slice('--project-path='.length);
    else if (arg === '--report-dir') options.reportDir = path.resolve(next() || DEFAULT_REPORT_DIR);
    else if (arg.startsWith('--report-dir=')) options.reportDir = path.resolve(arg.slice('--report-dir='.length));
    else if (arg === '--no-screenshot') options.screenshots = false;
    else if (arg === '--keep-open') options.keepOpen = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--timeout-ms') options.timeoutMs = Number(next() || DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg === '--port') options.port = Number(next() || 0);
    else if (arg.startsWith('--port=')) options.port = Number(arg.slice('--port='.length));
    else if (arg === '--ws-endpoint') options.wsEndpoint = next() || '';
    else if (arg.startsWith('--ws-endpoint=')) options.wsEndpoint = arg.slice('--ws-endpoint='.length);
    else if (arg === '--fresh-devtools') options.freshDevtools = true;
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--no-trust-project') options.trustProject = false;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 3000) {
    options.timeoutMs = DEFAULT_TIMEOUT_MS;
  }
  options.projectPath = path.resolve(options.projectPath || MINI_ROOT);
  options.cliPath = resolveCliPath(options.cliPath);
  return options;
}

function printHelp() {
  console.log(`3.0 mini program E2E bot

Usage:
  npm run bot:e2e-3.0
  npm run bot:e2e-3.0 -- --dry-run
  npm run bot:e2e-3.0 -- --cli-path "C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat"

Options:
  --cli-path <path>       WeChat DevTools cli.bat path. Env: WECHAT_DEVTOOLS_CLI.
  --project-path <path>   Mini program project path. Default: miniprogram/.
  --report-dir <path>     Report output directory.
  --no-screenshot         Do not capture step screenshots.
  --keep-open             Keep WeChat DevTools open after the run.
  --dry-run               Validate local setup without launching DevTools.
  --timeout-ms <ms>       Per-step wait timeout. Default: ${DEFAULT_TIMEOUT_MS}.
  --port <port>           DevTools automation port. Default: auto-pick.
  --ws-endpoint <url>     Connect to an already opened automation endpoint.
  --fresh-devtools        Quit existing DevTools before launching automation.
`);
}

function resolveCliPath(value) {
  if (value && fs.existsSync(value)) return path.resolve(value);
  const candidates = [
    value,
    'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
    'C:/Program Files/Tencent/微信web开发者工具/cli.bat',
    'C:/Program Files (x86)/Tencent/微信开发者工具/cli.bat',
    'C:/Program Files/Tencent/微信开发者工具/cli.bat',
    'C:/Program Files (x86)/Tencent/WeChat Web DevTools/cli.bat',
    'C:/Program Files/Tencent/WeChat Web DevTools/cli.bat'
  ].filter(Boolean);
  return candidates.find(item => fs.existsSync(item)) || (value ? path.resolve(value) : '');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function normalizePagePath(value) {
  return String(value || '').replace(/^\/+/, '').split('?')[0];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label || 'operation'} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function connectAutomatorEndpoint(endpoint, timeoutMs) {
  let connection;
  let expired = false;
  const label = `connect ${endpoint}`;
  const connectionPromise = AutomatorConnection.create(endpoint).then(created => {
    if (expired) {
      created.dispose();
      throw new Error(`${label} completed after timeout`);
    }
    connection = created;
    return created;
  });

  try {
    await withTimeout(connectionPromise, timeoutMs, label);
    const miniProgram = new AutomatorMiniProgram(connection);
    await withTimeout(miniProgram.checkVersion(), timeoutMs, `${label} version handshake`);
    return miniProgram;
  } catch (err) {
    expired = true;
    if (connection) connection.dispose();
    throw err;
  }
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function getFreePort(preferred) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', err => {
      if (preferred) {
        getFreePort(0).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
    server.listen(preferred || 0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && address.port;
      server.close(() => resolve(port));
    });
  });
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function findDevtoolsSecuritySetting() {
  const base = process.env.LOCALAPPDATA;
  if (!base || !fs.existsSync(base)) return null;

  const candidates = [];
  for (const appDirName of fs.readdirSync(base)) {
    const userDataRoot = path.join(base, appDirName, 'User Data');
    if (!fs.existsSync(userDataRoot)) continue;

    for (const profileName of fs.readdirSync(userDataRoot)) {
      const localDataDir = path.join(userDataRoot, profileName, 'WeappLocalData');
      if (!fs.existsSync(localDataDir)) continue;

      for (const fileName of fs.readdirSync(localDataDir)) {
        if (!/^ls_.*\.json$/i.test(fileName) && !/^localstorage_.*\.json$/i.test(fileName)) continue;
        const filePath = path.join(localDataDir, fileName);
        const data = readJsonFile(filePath);
        if (!data || !data.security || !Object.prototype.hasOwnProperty.call(data.security, 'enableServicePort')) continue;
        const stat = fs.statSync(filePath);
        candidates.push({
          filePath,
          mtimeMs: stat.mtimeMs,
          security: data.security
        });
      }
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] || null;
}

async function waitFor(predicate, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (err) {
      lastError = err;
    }
    await sleep(intervalMs || 250);
  }
  if (lastError) throw lastError;
  throw new Error('Timed out waiting for expected page state');
}

function e2eResume() {
  return {
    score: 92,
    basicInfo: {
      name: 'E2E Candidate',
      title: 'Data Analyst',
      phone: '17700001111',
      email: 'e2e@example.com',
      location: 'Shanghai'
    },
    summary: 'I build analytics dashboards, SQL data pipelines, and experiment reports for product teams with measurable business impact.',
    workExp: [
      {
        id: 1,
        company: 'Career Loop Labs',
        role: 'Data Analyst Intern',
        time: '2025.06-2025.09',
        desc: 'Built SQL dashboards and automated weekly funnel analysis, reducing manual reporting time by 40%.'
      }
    ],
    education: [
      {
        id: 1,
        school: 'University of California Berkeley',
        degree: 'Master',
        major: 'Data Science',
        time: '2024-2026'
      }
    ],
    skills: ['SQL', 'Python', 'A/B Testing', 'Dashboard', 'Product Analytics'],
    projects: [
      {
        id: 1,
        name: 'Job Matching Platform',
        role: 'Data Analyst',
        time: '2025',
        desc: 'Designed matching metrics and analyzed JD keyword coverage for candidate-job recommendations.'
      }
    ]
  };
}

function e2eReport() {
  return {
    id: 'e2e_report_1',
    role: 'Data Analyst',
    company: 'E2E Co',
    type: 'behavior',
    totalScore: 86,
    dimensions: [
      { name: '语言表达', score: 84 },
      { name: '内容逻辑', score: 88 },
      { name: '专业知识', score: 86 },
      { name: '应变能力', score: 82 },
      { name: '沟通表达', score: 87 }
    ],
    summary: '整体回答结构清晰，能结合数据分析项目说明影响，但量化结果还可以继续补强。',
    qaList: [
      {
        q: '请介绍一次你用数据分析推动产品决策的经历。',
        a: '我先定义核心漏斗指标，再用 SQL 和实验分组分析问题，最后推动产品团队调整转化路径。',
        feedback: '回答结构清楚，但建议补充更明确的业务指标和结果。',
        score: 78
      }
    ],
    strengths: '结构清晰，能说明分析方法。',
    weaknesses: '量化结果不足。',
    suggestion: '继续练习 STAR，并补充指标前后对比。',
    actionPlan: [
      { title: '补充量化结果', detail: '每个项目准备 2 个前后对比指标。', priority: 'high' },
      { title: '强化 STAR', detail: '用情境、任务、行动、结果重写回答。', priority: 'medium' }
    ],
    nextPractice: ['数据分析项目复盘', 'A/B 测试追问', '跨团队沟通案例'],
    redFlags: ['结果没有量化', '行动步骤不够具体'],
    createTime: new Date().toLocaleDateString('zh-CN')
  };
}

function e2eCampusItem() {
  return {
    id: 'campus_e2e_1',
    company: 'E2E Bank',
    positionName: '2027 Data Analyst Graduate Program',
    recruitType: '秋招',
    positionType: '数据',
    writtenTest: '含免笔试',
    region: '北美',
    locations: ['New York', 'Remote'],
    industry: '金融',
    educationLevel: '硕士友好',
    overseasFriendly: true,
    visaTag: 'Sponsor友好',
    visaStatus: 'support',
    deadlineDate: '2026-08-15',
    deadlineStatus: '30天内截止',
    startDate: '2026-07-01',
    applyUrl: 'https://example.com/e2e-campus'
  };
}

function buildRequestMock() {
  const resume = e2eResume();
  const report = e2eReport();
  const campus = e2eCampusItem();
  const fixtures = {
    resume,
    report,
    campus,
    resumeList: [
      {
        id: 101,
        name: 'E2E Data Analyst Resume',
        targetRole: 'Data Analyst',
        isDefault: true,
        updatedAt: new Date().toISOString()
      },
      {
        id: 102,
        name: 'E2E Product Analytics Resume',
        targetRole: 'Product Analyst',
        isDefault: false,
        updatedAt: new Date().toISOString()
      }
    ]
  };
  const json = JSON.stringify(fixtures).replace(/</g, '\\u003c');
  return `function(options) {
    var fixtures = ${json};
    options = options || {};
    var url = String(options.url || '');
    var method = String(options.method || 'GET').toUpperCase();
    var data = options.data || {};
    function respond(statusCode, body) {
      var res = { statusCode: statusCode || 200, data: body || {} };
      setTimeout(function() {
        if (typeof options.success === 'function') options.success(res);
        if (typeof options.complete === 'function') options.complete(res);
      }, 20);
      return { abort: function() {} };
    }
    function ok(data, message) {
      return respond(200, { code: 0, message: message || 'ok', data: data });
    }

    var e2eApplication = { id: 901, jobId: 'job_e2e_1', company: 'E2E Co', jobTitle: 'Data Analyst', status: 'interview_1', statusText: '一轮面试' };
    var e2eSpace = { id: 801, applicationId: 901, company: 'E2E Co', jobTitle: 'Data Analyst', interviewTime: '2026-07-20 10:00',
      round: 'interview_1', preparationCompletion: 40, companyExperiences: [{ id: 1, title: 'E2E 面经' }],
      frequentQuestions: [{ id: 'q1', title: '请介绍自己' }], algorithmQuestions: [{ id: 'q2', title: 'SQL Top N' }],
      behaviorQuestions: [{ id: 'q3', title: '冲突处理' }], roleQuestions: [{ id: 'q4', title: '漏斗分析' }] };
    if (/\\/api\\/v4\\/agents\\/tasks\\/\\d+\\/confirm/.test(url)) return ok({ id: 701, agentType: 'interview_coach', agentName: 'AI 面试教练', status: 'completed', output: { message: '已确认写入 Today 任务。' } });
    if (/\\/api\\/v4\\/agents\\/tasks/.test(url)) {
      if (method === 'GET') return ok([]);
      return ok({ id: 701, agentType: data.agentType || 'job_advisor', agentName: 'AI 岗位顾问', applicationId: 901, status: 'completed', input: data.input || {}, output: { message: '建议先完成岗位资格核验，再准备面试案例。' }, aiModel: 'deepseek-chat', promptVersion: 'job-advisor-v4.0-1', createdAt: new Date().toISOString() });
    }
    if (/\\/api\\/v4\\/agents/.test(url)) return ok([{ code: 'job_advisor', name: 'AI 岗位顾问' }, { code: 'application_assistant', name: 'AI 申请助手' }, { code: 'interview_coach', name: 'AI 面试教练' }, { code: 'career_planner', name: 'AI 职业规划师' }]);
    if (/\\/api\\/v4\\/applications\\/board/.test(url)) return ok({ groups: { preparing: [], applied: [], interview: [e2eApplication], offer: [], closed: [] }, statistics: { interview: 1 }, total: 1 });
    if (/\\/api\\/v4\\/interviews\\/sessions\\/\\d+\\/answers/.test(url)) return ok({ id: 601, content: 86, structure: 90, expression: 84, jobMatch: 88, average: 87, feedback: 'STAR 结构清晰，结果可继续量化。' });
    if (/\\/api\\/v4\\/interviews\\/sessions\\/\\d+\\/complete/.test(url)) return ok({ id: 501, sessionId: 401, spaceId: 801, overallScore: 87, dimensions: { content: 86, structure: 90, expression: 84, jobMatch: 88 }, strengths: [{ name: '结构', score: 90 }], weaknesses: [{ name: '表达', score: 84 }], questionFeedback: [{ question: '项目经历', feedback: '结构清晰' }], summary: '综合评分 87，优先提升表达。' });
    if (/\\/api\\/v4\\/interviews\\/spaces\\/\\d+\\/sessions/.test(url)) return ok({ id: 401, spaceId: 801, sessionType: data.sessionType || 'mock', status: 'active', aiModel: 'deepseek-chat', promptVersion: 'interview-v4.0-s4-1' });
    if (/\\/api\\/v4\\/interviews\\/spaces\\/\\d+/.test(url)) return ok({ space: e2eSpace, sessions: [] });
    if (/\\/api\\/v4\\/interviews\\/spaces/.test(url)) return ok([e2eSpace]);
    if (/\\/api\\/v4\\/interviews\\/today-tasks/.test(url)) return ok([{ id: 301, title: '补强面试表达', detail: '完成一次复练', priority: 'high', status: 'pending' }]);
    if (/\\/api\\/v4\\/interviews\\/trends/.test(url)) return ok([{ date: '2026-07-14', overallScore: 82, dimensions: { content: 80 } }]);

    if (/\\/api\\/features/.test(url)) {
      return ok({ recruitment: true, membership: true });
    }
    if (/\\/api\\/payment\\/config/.test(url)) {
      return ok({
        enabled: true,
        provider: 'virtual',
        configured: true,
        virtualConfigured: true,
        mock: false,
        available: true,
        availablePlanIds: [0, 1, 2, 3],
        trialConfigured: true,
        reason: ''
      });
    }
    if (/\\/api\\/ai\\/usage/.test(url)) {
      return ok({
        date: '2026-07-07',
        isVip: false,
        features: [
          { feature: 'assistant', label: 'AI 求职助手', used: 1, limit: 5, remaining: 4, unlimited: false },
          { feature: 'chat', label: 'AI Chat', used: 2, limit: 20, remaining: 18, unlimited: false },
          { feature: 'ats', label: 'ATS 简历优化', used: 1, limit: 3, remaining: 2, unlimited: false },
          { feature: 'career_plan', label: 'AI 求职规划', used: 0, limit: 1, remaining: 1, unlimited: false },
          { feature: 'project_builder', label: 'AI 项目生成', used: 0, limit: 1, remaining: 1, unlimited: false },
          { feature: 'networking', label: 'Networking 消息', used: 0, limit: 5, remaining: 5, unlimited: false }
        ]
      });
    }
    if (/\\/api\\/notify\\/templates/.test(url)) {
      return ok({
        application: 'tpl_application_e2e',
        interview: 'tpl_interview_e2e',
        campus_deadline: 'tpl_campus_e2e'
      });
    }
    if (/\\/api\\/notify\\/reminders/.test(url)) {
      if (method === 'GET') return ok([]);
      if (method === 'DELETE') return ok({ enabled: false });
      return ok({
        id: 'reminder_e2e_1',
        sourceType: data.sourceType || 'campus_schedule',
        targetId: data.targetId || fixtures.campus.id,
        reminderType: data.reminderType || 'campus_deadline',
        reminderDate: data.reminderDate || fixtures.campus.deadlineDate,
        enabled: true
      });
    }
    if (/\\/api\\/campus\\/meta/.test(url)) {
      return ok({ gradYears: ['2026', '2027'], industries: ['金融', '互联网', '咨询'] });
    }
    if (/\\/api\\/campus\\//.test(url)) {
      return ok(fixtures.campus);
    }
    if (/\\/api\\/campus/.test(url)) {
      return ok({ list: [fixtures.campus], total: 1 });
    }
    if (/\\/api\\/resumes\\/101\\/default/.test(url)) {
      return ok({ id: 101, isDefault: true });
    }
    if (/\\/api\\/resumes\\/101\\/optimization-history/.test(url)) {
      return ok({ id: 'opt_e2e_1' });
    }
    if (/\\/api\\/resumes\\/101/.test(url)) {
      return ok({
        id: 101,
        name: 'E2E Data Analyst Resume',
        targetRole: 'Data Analyst',
        isDefault: true,
        updatedAt: new Date().toISOString(),
        data: fixtures.resume,
        optimizationHistory: []
      });
    }
    if (/\\/api\\/resumes/.test(url)) {
      if (method === 'GET') return ok(fixtures.resumeList);
      if (method === 'POST') return ok({
        id: 101,
        name: data.name || 'E2E Data Analyst Resume',
        targetRole: data.targetRole || 'Data Analyst',
        isDefault: true,
        data: data.data || fixtures.resume
      });
      return ok({ id: 101 });
    }
    if (/\\/api\\/upload\\/resume-pdf\\/.*\\/extract/.test(url)) {
      return ok({ resume: fixtures.resume, extraction: { status: 'ok' } });
    }
    if (/\\/api\\/upload\\/resume-pdfs/.test(url)) {
      return ok([]);
    }
    if (/\\/api\\/career-assets\\/jd-match-reports/.test(url)) {
      if (method === 'GET') return ok([]);
      return ok(Object.assign({}, data, { clientId: data.id || 'match_e2e_1' }));
    }
    if (/\\/api\\/career-assets\\/application-materials/.test(url)) {
      return ok(method === 'GET' ? [] : Object.assign({}, data, { clientId: data.id || 'material_e2e_1' }));
    }
    if (/\\/api\\/career-assets\\/interview-notebook/.test(url)) {
      return ok(method === 'GET' ? [] : Object.assign({}, data, { id: data.id || 'q_e2e_1' }));
    }
    if (/\\/api\\/career-assets\\/interview-daily-practice/.test(url)) {
      return ok(method === 'GET' ? [] : Object.assign({}, data, { id: data.id || 'q_e2e_1' }));
    }
    if (/\\/api\\/ai\\/ats/.test(url)) {
      return ok({
        ats_score: 88,
        jd_match: 84,
        overall_advice: '简历与 JD 匹配度较高，建议补充 SQL 和实验指标的量化结果。',
        matched_keywords: ['SQL', 'Python', 'Dashboard'],
        missing_keywords: [{ keyword: 'Experimentation', priority: 'medium' }],
        section_suggestions: [{ section: 'projects', priority: 'high', suggestion: '补充 A/B testing 项目指标。' }],
        bullet_rewrites: [],
        format_issues: []
      });
    }
    if (/\\/api\\/ai\\/chat/.test(url)) {
      var messages = data.messages || [];
      var allText = JSON.stringify(messages);
      var content = '这是一份经过优化的个人优势：以 SQL、Python 和实验分析为核心，能够将业务问题拆解为可执行的数据指标，并推动产品团队形成决策闭环。';
      if (/totalScore|面试总结|生成总结/.test(allText)) {
        content = JSON.stringify({
          totalScore: 86,
          dimensions: fixtures.report.dimensions,
          qaScores: [{ index: 1, score: 78, reason: '回答有结构但缺少量化结果' }],
          strengths: fixtures.report.strengths,
          weaknesses: fixtures.report.weaknesses,
          suggestion: fixtures.report.suggestion,
          actionPlan: fixtures.report.actionPlan,
          nextPractice: fixtures.report.nextPractice,
          redFlags: fixtures.report.redFlags,
          summary: fixtures.report.summary
        });
      } else if (/JSON格式|下一个面试问题|专业的面试官/.test(allText)) {
        content = JSON.stringify({
          feedback: '开场准备充分，请用 STAR 结构回答。',
          question: '请介绍一次你用数据分析推动产品决策的经历。'
        });
      } else if (/STAR|模拟追问|标准回答|面试训练/.test(allText)) {
        content = 'S：在一次漏斗转化下降的项目中，我负责定位问题。\\nT：目标是在一周内找出关键流失点。\\nA：我用 SQL 拆解路径并和产品团队复盘实验。\\nR：最终推动页面调整，转化率提升 12%。';
      }
      return respond(200, { choices: [{ message: { content: content } }] });
    }
    if (/\\/api\\/users\\/profile/.test(url)) {
      return ok({
        id: 93001,
        nickname: 'E2E Candidate',
        avatarUrl: '',
        vipLevel: 0,
        vipExpiresAt: ''
      });
    }
    return ok(method === 'GET' ? [] : {});
  }`;
}

function buildUploadMock() {
  return `function(options) {
    options = options || {};
    var url = String(options.url || '');
    var body = {};
    if (/resume-pdf/.test(url)) {
      body = {
        code: 0,
        data: {
          id: 'resume_pdf_e2e_1',
          filename: 'e2e_resume.pdf',
          originalName: 'e2e_resume.pdf',
          url: '/uploads/resumes/e2e_resume.pdf',
          size: 123456
        }
      };
    } else {
      body = { code: 0, data: { text: 'This is an E2E transcript.' } };
    }
    var res = { statusCode: 200, data: JSON.stringify(body) };
    setTimeout(function() {
      if (typeof options.success === 'function') options.success(res);
      if (typeof options.complete === 'function') options.complete(res);
    }, 20);
    return { abort: function() {} };
  }`;
}

function seedStoragePayload() {
  const resume = e2eResume();
  const report = e2eReport();
  return {
    token: 'e2e_token_for_devtools_only',
    userProfile: {
      id: 93001,
      nickName: 'E2E Candidate',
      nickname: 'E2E Candidate',
      avatarUrl: '',
      major: 'Data Science'
    },
    vipInfo: { isVip: false, level: 0, expireDate: '' },
    onlineResume: resume,
    resumeFiles: [],
    currentQuestion: {
      id: 'q_e2e_behavior_1',
      title: '请介绍一次你用数据分析推动产品决策的经历。',
      question: '请介绍一次你用数据分析推动产品决策的经历。',
      answer: '建议使用 STAR 结构，说明背景、任务、行动和结果。',
      category: 'behavior',
      difficulty: '中等'
    },
    lastAiReport: report,
    ['aiReport_' + report.id]: report,
    jobProgressRecords: [],
    jdMatchReports: [],
    interviewMistakeNotebook: [],
    dailyPracticeQuestions: []
  };
}

class E2E30Bot {
  constructor(options) {
    this.options = options;
    this.miniProgram = null;
    this.devtoolsProcess = null;
    this.steps = [];
    this.reportId = timestamp();
    this.screenshotDir = path.join(this.options.reportDir, `screenshots-${this.reportId}`);
  }

  async run() {
    ensureDir(this.options.reportDir);
    if (this.options.screenshots) ensureDir(this.screenshotDir);

    if (this.options.dryRun) {
      await this.runDryRun();
      return this.finish();
    }

    await this.step('launch-devtools', 'Launch WeChat DevTools automation session', async () => {
      assert(this.options.cliPath && fs.existsSync(this.options.cliPath), 'WeChat DevTools cli.bat not found. Set WECHAT_DEVTOOLS_CLI or pass --cli-path.');
      assert(fs.existsSync(this.options.projectPath), `Project path not found: ${this.options.projectPath}`);
      const servicePortSetting = findDevtoolsSecuritySetting();
      assert(!servicePortSetting || servicePortSetting.security.enableServicePort !== false, `WeChat DevTools service port is disabled. Open WeChat DevTools > Settings > Security Settings, enable Service Port, then rerun npm run bot:e2e-3.0 -- --fresh-devtools. Detected config: ${servicePortSetting.filePath}`);
      this.miniProgram = await this.launchMiniProgram();
      this.miniProgram.on('console', log => {
        if (this.options.verbose) console.log('[mini-console]', log);
      });
      return `project=${this.options.projectPath}`;
    }, { screenshot: false });

    await this.installMocks();
    await this.seedStorage();
    await this.runJourneys();
    return this.finish();
  }

  async runDryRun() {
    await this.step('dry-run', 'Check automator dependency', async () => {
      require.resolve('miniprogram-automator');
      return 'miniprogram-automator is installed';
    }, { screenshot: false });

    await this.step('dry-run', 'Check mini program project files', async () => {
      const required = [
        path.join(this.options.projectPath, 'project.config.json'),
        path.join(this.options.projectPath, 'app.json'),
        path.join(this.options.projectPath, 'package-ai/pages/jd-match/jd-match.js'),
        path.join(this.options.projectPath, 'package-user/pages/job-progress/job-progress.js'),
        path.join(this.options.projectPath, 'package-career/pages/resume/resume.js'),
        path.join(this.options.projectPath, 'package-user/pages/vip/vip.js'),
        path.join(this.options.projectPath, 'package-ai/pages/ai-career/ai-career.js'),
        path.join(this.options.projectPath, 'package-ai/pages/interview-space/interview-space.js')
      ];
      const missing = required.filter(item => !fs.existsSync(item));
      assert(missing.length === 0, `missing files: ${missing.join(', ')}`);
      return `${required.length} files checked`;
    }, { screenshot: false });

    await this.step('dry-run', 'Check WeChat DevTools CLI path', async () => {
      if (!this.options.cliPath || !fs.existsSync(this.options.cliPath)) {
        return 'WARN: cli.bat not found; pass --cli-path or set WECHAT_DEVTOOLS_CLI before real E2E run';
      }
      return this.options.cliPath;
    }, { screenshot: false });

    await this.step('dry-run', 'Check WeChat DevTools service port setting', async () => {
      const servicePortSetting = findDevtoolsSecuritySetting();
      if (!servicePortSetting) {
        return 'WARN: DevTools service port setting not found; open WeChat DevTools once, enable Settings > Security Settings > Service Port, then rerun';
      }
      if (servicePortSetting.security.enableServicePort !== true) {
        return `WARN: service port disabled; enable WeChat DevTools > Settings > Security Settings > Service Port before real E2E. config=${servicePortSetting.filePath}`;
      }
      return `enabled port=${servicePortSetting.security.port || 'auto'} config=${servicePortSetting.filePath}`;
    }, { screenshot: false });
  }

  async launchMiniProgram() {
    const automator = require('miniprogram-automator');
    if (this.options.wsEndpoint) {
      return connectAutomatorEndpoint(
        this.options.wsEndpoint,
        Math.max(10000, this.options.timeoutMs)
      );
    }
    if (this.options.freshDevtools) {
      await this.runCli(['quit'], { timeoutMs: 10000, ignoreError: true });
      await sleep(1500);
    }
    // miniprogram-automator's SDK launcher can ignore its timeout when an old
    // Windows IDE server is still shutting down. A caller-supplied port is an
    // explicit request for the deterministic CLI auto + WebSocket path.
    if (this.options.port) {
      const args = ['auto', '--project', this.options.projectPath, '--auto-port', String(this.options.port)];
      if (this.options.trustProject) args.push('--trust-project');
      return this.connectViaCliAuto(automator, args, this.options.port);
    }
    try {
      return await automator.launch({
        cliPath: this.options.cliPath,
        projectPath: this.options.projectPath,
        timeout: this.options.timeoutMs * 2,
        trustProject: this.options.trustProject,
        port: this.options.port || undefined
      });
    } catch (primaryErr) {
      const port = this.options.port || await getFreePort(19000 + Math.floor(Math.random() * 1000));
      const attempts = [];
      for (const portFlag of ['--auto-port', '--port']) {
        const args = [
          'auto',
          '--project', this.options.projectPath,
          portFlag, String(port)
        ];
        if (this.options.trustProject) args.push('--trust-project');
        if (this.options.verbose) {
          console.warn(`[e2e-3.0] automator.launch failed, fallback to cli auto ${portFlag}:`, primaryErr.message);
          console.warn('[e2e-3.0] cli:', this.options.cliPath, args.join(' '));
        }
        try {
          return await this.connectViaCliAuto(automator, args, port);
        } catch (err) {
          attempts.push(`${portFlag}: ${err.message}`);
          if (this.options.verbose) console.warn(`[e2e-3.0] cli auto ${portFlag} failed:`, err.message);
          await this.runCli(['quit'], { timeoutMs: 10000, ignoreError: true });
          await sleep(1000);
        }
      }
      throw new Error(`Failed to launch/connect WeChat DevTools automation. SDK launch: ${primaryErr.message}; CLI fallbacks on port ${port}: ${attempts.join(' | ')}. If DevTools is already open, close it first or rerun with --fresh-devtools. If you opened an automation endpoint manually, pass --ws-endpoint.`);
    }
  }

  async connectViaCliAuto(automator, args, port) {
    const endpoint = `ws://127.0.0.1:${port}`;
    // The DevTools automation endpoint accepts a single WebSocket client. A
    // raw TCP readiness probe consumes that slot and makes the real connection
    // close immediately, so wait for the official CLI command to finish first.
    await this.runCli(args, { timeoutMs: Math.max(60000, this.options.timeoutMs * 4) });
    return connectAutomatorEndpoint(endpoint, Math.max(10000, this.options.timeoutMs));
  }

  spawnCli(args, stdio) {
    const command = `& ${quotePowerShell(this.options.cliPath)} ${args.map(quotePowerShell).join(' ')}`;
    return childProcess.spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        command
      ], {
        cwd: path.dirname(this.options.cliPath),
        stdio: stdio || 'ignore',
        windowsHide: true
      });
  }

  runCli(args, options) {
    const child = this.spawnCli(args, this.options.verbose ? 'inherit' : 'ignore');
    const timeoutMs = options && options.timeoutMs || 10000;
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try { child.kill(); } catch (_) {}
        resolve();
      }, timeoutMs);
      child.on('error', err => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (options && options.ignoreError) resolve();
        else reject(err);
      });
      child.on('exit', code => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (code === 0 || (options && options.ignoreError)) resolve();
        else reject(new Error(`cli exited with code ${code}`));
      });
    });
  }

  async installMocks() {
    await this.step('setup', 'Install WeChat API mocks', async () => {
      if (this.options.wsEndpoint) {
        await withTimeout(
          this.miniProgram.currentPage(),
          this.options.timeoutMs,
          'warm App automation channel'
        );
      }
      let useRuntimeOverride = Boolean(this.options.wsEndpoint);
      const mock = async (name, declaration) => {
        if (!useRuntimeOverride) {
          try {
            return await withTimeout(
              this.miniProgram.mockWxMethod(name, declaration),
              Math.min(3000, Math.max(1500, this.options.timeoutMs)),
              `mock wx.${name}`
            );
          } catch (err) {
            useRuntimeOverride = true;
            if (this.options.verbose) {
              console.warn(`[e2e-3.0] App.mockWxMethod is unavailable; using runtime override: ${err.message}`);
            }
          }
        }

        const overrideDeclaration = `function() {
            var methodName = ${JSON.stringify(name)};
            var implementation = (${declaration});
            implementation.__e2eMock = true;
            try {
              wx[methodName] = implementation;
            } catch (_) {}
            if (!wx[methodName] || wx[methodName].__e2eMock !== true) {
              try {
                Object.defineProperty(wx, methodName, {
                  configurable: true,
                  enumerable: true,
                  writable: true,
                  value: implementation
                });
              } catch (_) {}
            }
            return Boolean(wx[methodName] && wx[methodName].__e2eMock === true);
          }`;
        const response = await withTimeout(
          this.miniProgram.send('App.callFunction', {
            functionDeclaration: overrideDeclaration,
            args: []
          }),
          Math.max(5000, this.options.timeoutMs),
          `override wx.${name}`
        );
        const installed = Boolean(response && response.result);
        assert(installed, `runtime override wx.${name} was rejected`);
      };
      await mock('request', buildRequestMock());
      await mock('uploadFile', buildUploadMock());
      await mock('showActionSheet', `function(options) {
        options = options || {};
        setTimeout(function() {
          if (typeof options.success === 'function') options.success({ tapIndex: 0 });
          if (typeof options.complete === 'function') options.complete({ tapIndex: 0 });
        }, 10);
      }`);
      await mock('showModal', `function(options) {
        options = options || {};
        setTimeout(function() {
          if (typeof options.success === 'function') options.success({ confirm: true, cancel: false });
          if (typeof options.complete === 'function') options.complete({ confirm: true, cancel: false });
        }, 10);
      }`);
      await mock('showToast', `function(options) {
        options = options || {};
        if (typeof options.success === 'function') options.success({});
        if (typeof options.complete === 'function') options.complete({});
      }`);
      await mock('showLoading', `function(options) {
        options = options || {};
        if (typeof options.success === 'function') options.success({});
        if (typeof options.complete === 'function') options.complete({});
      }`);
      await mock('hideLoading', `function(options) {
        options = options || {};
        if (typeof options.success === 'function') options.success({});
        if (typeof options.complete === 'function') options.complete({});
      }`);
      await mock('requestSubscribeMessage', `function(options) {
        options = options || {};
        var result = {};
        (options.tmplIds || []).forEach(function(id) { result[id] = 'accept'; });
        setTimeout(function() {
          if (typeof options.success === 'function') options.success(result);
          if (typeof options.complete === 'function') options.complete(result);
        }, 10);
      }`);
      await mock('chooseMessageFile', `function(options) {
        options = options || {};
        var res = { tempFiles: [{ name: 'e2e_resume.pdf', path: 'tmp/e2e_resume.pdf', tempFilePath: 'tmp/e2e_resume.pdf', size: 123456 }] };
        setTimeout(function() {
          if (typeof options.success === 'function') options.success(res);
          if (typeof options.complete === 'function') options.complete(res);
        }, 10);
      }`);
      // wx.chooseFile is only exposed by some desktop/enterprise runtimes.
      // Production pages already fall back to chooseMessageFile when absent, so
      // do not ask automator to mock a method that the current runtime lacks.
      await mock('setClipboardData', `function(options) {
        options = options || {};
        if (typeof options.success === 'function') options.success({});
        if (typeof options.complete === 'function') options.complete({});
      }`);
      await mock('downloadFile', `function(options) {
        options = options || {};
        var res = { statusCode: 200, tempFilePath: 'tmp/e2e_resume.pdf' };
        if (typeof options.success === 'function') options.success(res);
        if (typeof options.complete === 'function') options.complete(res);
      }`);
      await mock('openDocument', `function(options) {
        options = options || {};
        if (typeof options.success === 'function') options.success({});
        if (typeof options.complete === 'function') options.complete({});
      }`);
      return 'request/upload/subscribe/file dialogs mocked';
    }, { screenshot: false });
  }

  async seedStorage() {
    await this.step('setup', 'Seed login, resume, question, report, and quota fixtures', async () => {
      const payload = seedStoragePayload();
      await this.miniProgram.evaluate(function(seed) {
        Object.keys(seed).forEach(function(key) {
          wx.setStorageSync(key, seed[key]);
        });
        return {
          token: wx.getStorageSync('token'),
          resumeName: (wx.getStorageSync('onlineResume').basicInfo || {}).name
        };
      }, payload);
      return 'fixtures stored in mini program storage';
    }, { screenshot: false });
  }

  async runJourneys() {
    await this.step('home', 'Open 3.0 home workbench', async () => {
      const page = await this.openPage('/pages/index/index');
      assertPath(page, 'pages/index/index');
      await page.waitFor(800);
      return 'home page opened';
    });

    await this.step('login', 'Verify seeded login state on profile page', async () => {
      const page = await this.openPage('/pages/profile/profile');
      assertPath(page, 'pages/profile/profile');
      await page.waitFor(800);
      const stored = await this.miniProgram.evaluate(function() {
        return {
          hasToken: !!wx.getStorageSync('token'),
          nickname: (wx.getStorageSync('userProfile') || {}).nickName || ''
        };
      });
      assert(stored.hasToken, 'token was not seeded');
      return `nickname=${stored.nickname || 'seeded'}`;
    });

    await this.step('resume', 'Upload attachment resume and apply AI polish', async () => {
      const page = await this.openPage('/package-career/pages/resume/resume');
      assertPath(page, 'package-career/pages/resume/resume');
      await waitFor(async () => {
        return this.pageData('onlineResume.basicInfo.name');
      }, this.options.timeoutMs);

      await this.pageSetData({ currentTab: 1 });
      await this.pageCallMethod('handleUpload');
      await waitFor(async () => {
        const list = await this.pageData('resumeList');
        return Array.isArray(list) && list.length > 0;
      }, this.options.timeoutMs);

      await this.pageSetData({ currentTab: 0 });
      await this.pageCallMethod('handleAiPolish');
      await waitFor(async () => {
        const visible = await this.pageData('showAiResult');
        const content = await this.pageData('aiResultContent');
        return visible && content;
      }, this.options.timeoutMs);
      await this.pageCallMethod('applyPolish');
      await waitFor(async () => {
        const summary = await this.pageData('onlineResume.summary');
        return /数据指标|SQL|优化|分析/.test(String(summary || ''));
      }, this.options.timeoutMs);
      const summary = await this.pageData('onlineResume.summary');
      return `resume polished, summaryLength=${String(summary || '').length}`;
    });

    await this.step('jd-match', 'Run JD match, save to progress, and open progress detail', async () => {
      let page = await this.openPage('/package-ai/pages/jd-match/jd-match');
      assertPath(page, 'package-ai/pages/jd-match/jd-match');
      await waitFor(async () => {
        const hasOnlineResume = await this.pageData('hasOnlineResume');
        const loading = await this.pageData('onlineResumeLoading');
        return hasOnlineResume || !loading;
      }, this.options.timeoutMs);

      const jdText = [
        'We are hiring a Data Analyst to build SQL dashboards, analyze product funnels,',
        'run A/B testing, partner with product managers, and communicate insights to leadership.',
        'The role requires Python, SQL, experimentation, data visualization, and strong communication.'
      ].join(' ');
      await this.pageSetData({
        form: {
          jobTitle: 'Data Analyst',
          company: 'E2E Co',
          jobLink: 'https://example.com/jobs/data-analyst',
          jdText,
          resumeText: ''
        },
        jdLen: jdText.length
      });
      await this.pageCallMethod('startMatch');
      await waitFor(async () => (await this.pageData('step')) === 'result', this.options.timeoutMs);
      const report = await this.pageData('report');
      assert(report && Number(report.score) > 0, 'JD match report was not generated');
      assert(report.resumeVersionId, 'resume version id missing from JD report');

      await this.pageCallMethod('saveToProgress');
      await waitFor(async () => !!(await this.pageData('savedProgress')), this.options.timeoutMs);
      page = await this.openPage('/package-user/pages/job-progress/job-progress');
      assertPath(page, 'package-user/pages/job-progress/job-progress');
      await waitFor(async () => {
        const list = await this.pageData('filteredRecords');
        return Array.isArray(list) && list.length > 0;
      }, this.options.timeoutMs);
      const list = await this.pageData('filteredRecords');
      const target = list.find(item => item.company === 'E2E Co' && item.jobTitle === 'Data Analyst');
      assert(target, 'newly saved E2E progress record was not found');
      await this.pageCallMethod('openRecordDetail', { currentTarget: { dataset: { id: target.id } } });
      await waitFor(async () => !!(await this.pageData('showDetail')), this.options.timeoutMs);
      const selected = await this.pageData('selectedRecord');
      assert(selected && selected.hasMatchReport, 'progress detail did not include JD match report');
      return `progress=${selected.company}/${selected.jobTitle}, score=${selected.matchScore}`;
    });

    await this.step('question-ai', 'Generate interview question STAR training and save to notebook', async () => {
      const page = await this.openPage('/package-content/pages/question-detail/question-detail?id=q_e2e_behavior_1');
      assertPath(page, 'package-content/pages/question-detail/question-detail');
      await waitFor(async () => {
        const q = await this.pageData('q');
        return q && q.title && q.title !== '题目加载失败';
      }, this.options.timeoutMs);
      await this.pageCallMethod('generateAiTraining', { currentTarget: { dataset: { mode: 'star' } } });
      await waitFor(async () => {
        const training = await this.pageData('aiTraining');
        return training && training.result && !training.loading;
      }, this.options.timeoutMs);
      await this.pageCallMethod('saveAiTrainingToNotebook');
      await waitFor(async () => !!(await this.pageData('notebookStatus')), this.options.timeoutMs);
      const training = await this.pageData('aiTraining');
      return `trainingMode=${training.mode}, length=${String(training.result || '').length}`;
    });

    await this.step('ai-report', 'Finish one-question AI interview and open report', async () => {
      let page = await this.openPage('/package-ai/pages/interview-dialog/interview-dialog?type=behavior&company=E2E%20Co&position=Data%20Analyst&questionCount=1');
      assertPath(page, 'package-ai/pages/interview-dialog/interview-dialog');
      await waitFor(async () => {
        const loading = await this.pageData('loading');
        const chatList = await this.pageData('chatList');
        return !loading && Array.isArray(chatList) && chatList.length > 0;
      }, this.options.timeoutMs);
      await this.pageSetData({
        userAnswer: 'I used SQL to identify a funnel drop, created an experiment dashboard, and helped the product team improve conversion by 12%.'
      });
      await this.pageCallMethod('submitAnswer');
      await waitFor(async () => {
        const current = await this.miniProgram.currentPage();
        return normalizePagePath(current && current.path) === 'package-ai/pages/ai-report/ai-report';
      }, this.options.timeoutMs + 5000);
      page = await this.miniProgram.currentPage();
      await waitFor(async () => {
        const report = await this.pageData('report');
        return report && Number(report.totalScore) > 0;
      }, this.options.timeoutMs);
      const report = await this.pageData('report');
      return `reportScore=${report.totalScore}, weakQuestions=${(report.weakQaList || []).length}`;
    });

    await this.step('v4-ai-career', 'Open four-Agent AI Career and finish a contextual task', async () => {
      const page = await this.openPage('/package-ai/pages/ai-career/ai-career');
      assertPath(page, 'package-ai/pages/ai-career/ai-career');
      await waitFor(async () => {
        const agents = await this.pageData('agents');
        const applications = await this.pageData('applications');
        return Array.isArray(agents) && agents.length === 4 && Array.isArray(applications) && applications.length === 1;
      }, this.options.timeoutMs);
      await this.pageSetData({ selectedAgent: 'job_advisor', query: '如何准备当前岗位？' });
      await this.pageCallMethod('runAgent');
      await waitFor(async () => {
        const task = await this.pageData('currentTask');
        return task && task.status === 'completed' && task.output && task.output.message;
      }, this.options.timeoutMs);
      const task = await this.pageData('currentTask');
      return `agent=${task.agentType}, status=${task.status}`;
    });

    await this.step('v4-interview-space', 'Run a job-specific mock interview and generate capability report', async () => {
      const page = await this.openPage('/package-ai/pages/interview-space/interview-space');
      assertPath(page, 'package-ai/pages/interview-space/interview-space');
      await waitFor(async () => {
        const spaces = await this.pageData('spaces');
        return Array.isArray(spaces) && spaces.some(item => Number(item.id) === 801);
      }, this.options.timeoutMs);
      await this.pageCallMethod('selectSpace', { currentTarget: { dataset: { id: 801 } } });
      await waitFor(async () => {
        const current = await this.pageData('current');
        return current && Number(current.id) === 801 && current.frequentQuestions && current.frequentQuestions.length;
      }, this.options.timeoutMs);
      await this.pageCallMethod('startMock');
      await waitFor(async () => !!(await this.pageData('session.id')), this.options.timeoutMs);
      await this.pageSetData({ answer: '情况：漏斗下降。任务：定位原因。行动：分析 SQL 数据。结果：转化率提升 12%。' });
      await this.pageCallMethod('submitAnswer');
      await waitFor(async () => Number(await this.pageData('feedback.average')) > 0, this.options.timeoutMs);
      await this.pageCallMethod('complete');
      await waitFor(async () => Number(await this.pageData('report.overallScore')) > 0, this.options.timeoutMs);
      const report = await this.pageData('report');
      return `space=801, reportScore=${report.overallScore}`;
    });

    await this.step('campus', 'Subscribe campus deadline reminder', async () => {
      const page = await this.openPage('/pages/campus/campus');
      assertPath(page, 'pages/campus/campus');
      await waitFor(async () => {
        const list = await this.pageData('list');
        return Array.isArray(list) && list.length > 0;
      }, this.options.timeoutMs);
      await this.pageCallMethod('subscribeFromCard', { currentTarget: { dataset: { index: 0 } } });
      await waitFor(async () => {
        const list = await this.pageData('list');
        return list && list[0] && list[0]._isSubscribed;
      }, this.options.timeoutMs);
      const list = await this.pageData('list');
      return `campus=${list[0].company}, deadline=${list[0].deadlineDate}`;
    });

    await this.step('vip', 'Open membership quota page', async () => {
      const page = await this.openPage('/package-user/pages/vip/vip');
      assertPath(page, 'package-user/pages/vip/vip');
      await waitFor(async () => {
        const paymentConfig = await this.pageData('paymentConfig');
        const quotaFeatures = await this.pageData('quotaFeatures');
        return paymentConfig || (Array.isArray(quotaFeatures) && quotaFeatures.length > 0);
      }, this.options.timeoutMs);
      const paymentAvailable = await this.pageData('paymentAvailable');
      const quotaFeatures = await this.pageData('quotaFeatures');
      assert(Array.isArray(quotaFeatures) && quotaFeatures.length > 0, 'AI quota features not displayed');
      return `payment=${paymentAvailable}, quotaFeatures=${quotaFeatures.length}`;
    });
  }

  async pageData(pathValue) {
    return withTimeout(
      this.miniProgram.evaluate(function(dataPath) {
        var pages = getCurrentPages();
        var page = pages[pages.length - 1];
        if (!page) return undefined;
        var value = page.data;
        if (!dataPath) return value;
        dataPath.split('.').forEach(function(part) {
          value = value == null ? undefined : value[part];
        });
        return value;
      }, pathValue || ''),
      this.options.timeoutMs,
      `read runtime page data ${pathValue || '<all>'}`
    );
  }

  async pageSetData(data) {
    return withTimeout(
      this.miniProgram.evaluate(function(nextData) {
        var pages = getCurrentPages();
        var page = pages[pages.length - 1];
        if (!page) throw new Error('current page not found');
        page.setData(nextData);
        return true;
      }, data),
      this.options.timeoutMs,
      'set runtime page data'
    );
  }

  async pageCallMethod(method, ...args) {
    return withTimeout(
      this.miniProgram.evaluate(function(methodName, methodArgs) {
        var pages = getCurrentPages();
        var page = pages[pages.length - 1];
        if (!page || typeof page[methodName] !== 'function') {
          throw new Error('page method not found: ' + methodName);
        }
        setTimeout(function() { page[methodName].apply(page, methodArgs || []); }, 0);
        return true;
      }, method, args),
      this.options.timeoutMs,
      `call runtime page method ${method}`
    );
  }

  async openPage(url) {
    const clean = normalizePagePath(url);
    const current = await withTimeout(
      this.miniProgram.currentPage(),
      this.options.timeoutMs,
      `read current page before opening ${clean}`
    );
    if (normalizePagePath(current && current.path) === clean) {
      return current;
    }
    if (TAB_PAGES.has(clean)) {
      await withTimeout(
        this.miniProgram.evaluate(function(target) {
          setTimeout(function() { wx.switchTab({ url: target }); }, 0);
          return true;
        }, url),
        this.options.timeoutMs,
        `schedule switchTab to ${clean}`
      );
      return this.waitForCurrentPage(clean);
    }
    await withTimeout(
      this.miniProgram.evaluate(function() {
        setTimeout(function() { wx.reLaunch({ url: '/pages/index/index' }); }, 0);
        return true;
      }),
      this.options.timeoutMs,
      'schedule reLaunch to pages/index/index'
    );
    await this.waitForCurrentPage('pages/index/index');
    await withTimeout(
      this.miniProgram.evaluate(function(target) {
        setTimeout(function() {
          wx.navigateTo({
            url: target,
            fail: function(err) {
              wx.setStorageSync('__e2eRouteError', (err && err.errMsg) || String(err || 'navigateTo failed'));
            }
          });
        }, 0);
        return true;
      }, url),
      this.options.timeoutMs,
      `schedule navigateTo to ${clean}`
    );
    return this.waitForCurrentPage(clean);
  }

  async waitForCurrentPage(expected) {
    const deadline = Date.now() + this.options.timeoutMs;
    let lastPath = '';
    while (Date.now() < deadline) {
      try {
        const page = await withTimeout(
          this.miniProgram.currentPage(),
          Math.min(3000, this.options.timeoutMs),
          `read current page while waiting for ${expected}`
        );
        lastPath = normalizePagePath(page && page.path);
        if (lastPath === expected) return page;
      } catch (_) {}
      await sleep(200);
    }
    throw new Error(`expected page ${expected}, got ${lastPath || '<empty>'}`);
  }

  async step(group, name, fn, opts) {
    const started = Date.now();
    const stepTimeoutMs = opts && opts.timeoutMs
      ? opts.timeoutMs
      : group === 'launch-devtools'
        ? Math.max(120000, this.options.timeoutMs * 8)
        : Math.max(30000, this.options.timeoutMs * 3);
    const entry = {
      group,
      name,
      status: 'PASS',
      durationMs: 0,
      detail: '',
      screenshot: ''
    };
    try {
      const detail = await withTimeout(
        Promise.resolve().then(fn),
        stepTimeoutMs,
        `${group} :: ${name}`
      );
      entry.detail = detail || '';
      entry.durationMs = Date.now() - started;
      if (this.options.screenshots && (!opts || opts.screenshot !== false) && this.miniProgram) {
        entry.screenshot = await this.captureScreenshot(group, name);
      }
      this.steps.push(entry);
      console.log(`[PASS] ${group} :: ${name} (${entry.durationMs}ms)`);
      return detail;
    } catch (err) {
      entry.status = 'FAIL';
      entry.durationMs = Date.now() - started;
      entry.detail = err && err.message ? err.message : String(err);
      if (this.options.screenshots && (!opts || opts.screenshot !== false) && this.miniProgram) {
        try { entry.screenshot = await this.captureScreenshot(group, name); } catch (_) {}
      }
      this.steps.push(entry);
      console.error(`[FAIL] ${group} :: ${name} - ${entry.detail}`);
      throw err;
    }
  }

  async captureScreenshot(group, name) {
    const safe = `${String(group).replace(/[^a-z0-9_-]/gi, '-')}-${String(name).replace(/[^a-z0-9_-]/gi, '-').slice(0, 60)}`;
    const file = path.join(this.screenshotDir, `${String(this.steps.length + 1).padStart(2, '0')}-${safe}.png`);
    await this.miniProgram.screenshot({ path: file });
    return file;
  }

  async cleanup() {
    if (this.miniProgram && !this.options.keepOpen) {
      if (this.options.wsEndpoint) {
        this.miniProgram.disconnect();
      } else {
        await withTimeout(this.miniProgram.close(), 10000, 'close DevTools automation')
          .catch(() => {
            try { this.miniProgram.disconnect(); } catch (_) {}
          });
      }
      this.miniProgram = null;
    }
    if (this.devtoolsProcess && !this.options.keepOpen) {
      try { this.devtoolsProcess.kill(); } catch (_) {}
      this.devtoolsProcess = null;
    }
  }

  finish() {
    const failed = this.steps.filter(item => item.status === 'FAIL').length;
    const passed = this.steps.filter(item => item.status === 'PASS').length;
    const report = {
      summary: { passed, failed, total: this.steps.length },
      options: this.options,
      steps: this.steps
    };
    this.writeReports(report);
    console.log(`3.0 E2E bot finished: ${passed} passed, ${failed} failed.`);
    return failed === 0 ? 0 : 1;
  }

  writeReports(report) {
    ensureDir(this.options.reportDir);
    const jsonPath = path.join(this.options.reportDir, `e2e-3.0-${this.reportId}.json`);
    const mdPath = path.join(this.options.reportDir, `e2e-3.0-${this.reportId}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');
    console.log(`Markdown report: ${mdPath}`);
    console.log(`JSON report: ${jsonPath}`);
  }
}

function assertPath(page, expected) {
  const actual = normalizePagePath(page && page.path);
  assert(actual === expected, `expected page ${expected}, got ${actual || '<empty>'}`);
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# 职引小程序 3.0 E2E 验收报告');
  lines.push('');
  lines.push(`生成时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push('');
  lines.push(`结果：${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.total} total`);
  lines.push('');
  lines.push('## 覆盖范围');
  lines.push('');
  lines.push('- 首页工作台打开');
  lines.push('- 模拟登录态');
  lines.push('- 附件简历上传、AI 简历润色');
  lines.push('- JD 匹配、保存投递、投递追踪详情');
  lines.push('- 简历版本选择字段校验');
  lines.push('- 面经 AI 训练、保存错题本');
  lines.push('- AI 模拟面试报告');
  lines.push('- 校招截止提醒');
  lines.push('- 会员额度页');
  lines.push('');
  lines.push('## 注意');
  lines.push('');
  lines.push('该机器人运行在微信开发者工具自动化环境，会 mock 微信授权、文件选择、订阅消息和后端请求，避免污染生产数据。真实手机上的微信登录授权、手机文件选择器、订阅消息授权弹窗和虚拟支付弹窗仍需人工真机确认。');
  lines.push('');
  lines.push('## 步骤');
  lines.push('');
  lines.push('| 状态 | 分组 | 步骤 | 耗时 | 详情 | 截图 |');
  lines.push('| --- | --- | --- | ---: | --- | --- |');
  report.steps.forEach(step => {
    const screenshot = step.screenshot ? `[png](${step.screenshot.replace(/\\/g, '/')})` : '';
    lines.push(`| ${step.status} | ${step.group} | ${step.name} | ${step.durationMs}ms | ${escapeCell(step.detail)} | ${screenshot} |`);
  });
  lines.push('');
  return lines.join('\n');
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

(async () => {
  let bot = null;
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    bot = new E2E30Bot(options);
    const code = await bot.run();
    await bot.cleanup();
    process.exit(code);
  } catch (err) {
    if (bot) {
      bot.writeReports({
        summary: {
          passed: bot.steps.filter(item => item.status === 'PASS').length,
          failed: bot.steps.filter(item => item.status === 'FAIL').length || 1,
          total: bot.steps.length
        },
        options: bot.options,
        steps: bot.steps
      });
      await bot.cleanup();
    }
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
