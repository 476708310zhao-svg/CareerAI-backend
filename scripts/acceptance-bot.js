#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const DEFAULT_TIMEOUT_MS = 10000;

function parseArgs(argv) {
  const options = {
    baseUrl: '',
    port: 0,
    write: undefined,
    lightStatic: true,
    fullStatic: false,
    report: true,
    reportDir: path.join(ROOT, 'reports', 'acceptance'),
    keepData: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--base-url') options.baseUrl = next() || '';
    else if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice('--base-url='.length);
    else if (arg === '--port') options.port = Number(next() || 0);
    else if (arg.startsWith('--port=')) options.port = Number(arg.slice('--port='.length));
    else if (arg === '--write') options.write = true;
    else if (arg === '--read-only') options.write = false;
    else if (arg === '--skip-static') options.lightStatic = false;
    else if (arg === '--full-static') options.fullStatic = true;
    else if (arg === '--no-report') options.report = false;
    else if (arg === '--report-dir') options.reportDir = path.resolve(next() || options.reportDir);
    else if (arg.startsWith('--report-dir=')) options.reportDir = path.resolve(arg.slice('--report-dir='.length));
    else if (arg === '--keep-data') options.keepData = true;
    else if (arg === '--timeout-ms') options.timeoutMs = Number(next() || DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg === '--verbose') options.verbose = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  options.baseUrl = normalizeBaseUrl(options.baseUrl);
  if (options.write === undefined) options.write = !options.baseUrl;
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) {
    options.timeoutMs = DEFAULT_TIMEOUT_MS;
  }
  return options;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function printHelp() {
  console.log(`Acceptance bot

Usage:
  npm run bot:acceptance
  npm run bot:acceptance -- --base-url http://127.0.0.1:3001 --read-only
  npm run check:acceptance

Options:
  --base-url <url>       Check an already running environment.
  --write                Run write-path checks against --base-url.
  --read-only            Only run read-only and anonymous-protection checks.
  --full-static          Also run scripts/check-miniprogram.js.
  --skip-static          Skip the built-in light mini program static checks.
  --no-report            Do not write Markdown/JSON reports.
  --report-dir <dir>     Report output directory.
  --keep-data            Do not delete local test data created by the bot.
  --timeout-ms <ms>      Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}.
`);
}

class AcceptanceBot {
  constructor(options) {
    this.options = options;
    this.mode = options.baseUrl ? 'external' : 'local';
    this.baseUrl = options.baseUrl;
    this.server = null;
    this.db = null;
    this.featureFlags = null;
    this.previousFlags = {};
    this.created = {
      email: '',
      userId: null,
      resumeId: null,
      applicationId: null,
      orderNo: '',
    };
    this.state = {
      authToken: '',
      sampleJob: null,
      paymentConfig: null,
      features: {},
    };
    this.steps = [];
  }

  async run() {
    const startedAt = new Date();
    try {
      if (this.options.lightStatic) {
        await this.runStaticChecks();
      }
      if (this.options.fullStatic) {
        await this.runFullStaticCheck();
      }

      if (this.mode === 'local') {
        await this.startLocalServer();
      }

      await this.runReadOnlyApiChecks();
      if (this.options.write) {
        await this.runWritePathChecks();
      } else {
        this.skip('write-flows', 'User journey write checks', 'write mode is disabled');
      }
    } finally {
      await this.cleanup();
    }

    const report = this.buildReport(startedAt);
    if (this.options.report) {
      this.writeReport(report);
    }
    this.printSummary(report);
    return report.summary.failed === 0 ? 0 : 1;
  }

  async startLocalServer() {
    const port = this.options.port || (4300 + Math.floor(Math.random() * 500));
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: String(port),
      JWT_SECRET: 'acceptance_bot_secret_please_do_not_use_in_production_1234567890',
      ADMIN_USERNAME: 'acceptance_admin',
      ADMIN_PASSWORD: 'acceptance_admin_password_123',
      CRON_SECRET: 'acceptance_cron_secret_1234567890abcdef',
      ALLOWED_ORIGIN: `http://127.0.0.1:${port}`,
      WEBHOOK_SECRET: 'acceptance_webhook_secret_1234567890abcdef',
      PAYMENT_ENABLED: 'true',
      PAYMENT_PROVIDER: 'wxpay',
      ENABLE_MOCK_PAYMENT: 'true',
      RAPID_API_KEY: '',
      ADZUNA_APP_ID: '',
      ADZUNA_APP_KEY: '',
      LIVE_JOBS_ENABLED: 'false',
      DISABLE_FREE_JOB_SOURCES: 'true',
      RECRUITMENT_FEATURE_ENABLED: 'true',
      MEMBERSHIP_FEATURE_ENABLED: 'false',
    });

    const { startServer } = require(path.join(ROOT, 'server'));
    this.featureFlags = require(path.join(ROOT, 'utils', 'featureFlags'));
    this.db = require(path.join(ROOT, 'db', 'database'));
    this.previousFlags.recruitment = this.featureFlags.isFeatureEnabled('recruitment');
    this.previousFlags.membership = this.featureFlags.isFeatureEnabled('membership');
    this.featureFlags.updateFeatureFlag('recruitment', true);
    this.featureFlags.updateFeatureFlag('membership', false);

    this.server = startServer(port);
    this.baseUrl = `http://127.0.0.1:${port}`;
    await this.waitForServer();
  }

  async waitForServer() {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${this.baseUrl}/api/health`);
        if (res.ok) return;
      } catch (err) {
        // Wait and retry.
      }
      await sleep(200);
    }
    throw new Error(`Server did not become ready at ${this.baseUrl}`);
  }

  async runStaticChecks() {
    await this.step('static', 'app.json is valid and registers real pages', async () => {
      const app = readJson(path.join(MINI_ROOT, 'app.json'));
      assert(Array.isArray(app.pages) && app.pages.length > 0, 'app.json has no pages');
      const missing = [];
      const allPages = [
        ...(app.pages || []).map(page => ({ root: '', page })),
        ...(app.subPackages || []).flatMap(pkg => (pkg.pages || []).map(page => ({ root: pkg.root, page }))),
      ];
      allPages.forEach(({ root, page }) => {
        const pagePath = path.join(MINI_ROOT, root || '', page);
        ['.js', '.wxml'].forEach(ext => {
          if (!fs.existsSync(`${pagePath}${ext}`)) {
            missing.push(path.relative(ROOT, `${pagePath}${ext}`));
          }
        });
      });
      assert(missing.length === 0, `missing page files: ${missing.slice(0, 8).join(', ')}`);
      return `${allPages.length} pages registered`;
    });

    await this.step('static', 'tab bar assets exist', async () => {
      const app = readJson(path.join(MINI_ROOT, 'app.json'));
      const missing = [];
      for (const item of (app.tabBar && app.tabBar.list) || []) {
        for (const key of ['iconPath', 'selectedIconPath']) {
          if (item[key] && !fs.existsSync(path.join(MINI_ROOT, item[key]))) {
            missing.push(`${item.pagePath}:${key}`);
          }
        }
      }
      assert(missing.length === 0, `missing tab icons: ${missing.join(', ')}`);
      return `${((app.tabBar && app.tabBar.list) || []).length} tab items checked`;
    });

    await this.step('static', 'project config is miniprogram', async () => {
      const config = readJson(path.join(MINI_ROOT, 'project.config.json'));
      assert(config.compileType === 'miniprogram', `compileType is ${config.compileType || '<empty>'}`);
      return 'compileType=miniprogram';
    });
  }

  async runFullStaticCheck() {
    await this.step('static', 'release static checker passes', async () => {
      const output = runCheckMiniprogramInProcess();
      return lastLines(output, 5) || 'check-miniprogram passed';
    });
  }

  async runReadOnlyApiChecks() {
    await this.step('api', 'health endpoint', async () => {
      const result = await this.get('/api/health');
      expectStatus(result, 200);
      assert(result.body && result.body.status === 'ok', 'health payload status is not ok');
      return `200 in ${result.durationMs}ms`;
    });

    await this.step('api', 'public feature flags', async () => {
      const result = await this.get('/api/features');
      expectStatus(result, 200);
      expectCode0(result);
      assert(result.body.data && typeof result.body.data.recruitment === 'boolean', 'missing recruitment flag');
      this.state.features = result.body.data;
      return `recruitment=${result.body.data.recruitment}, membership=${result.body.data.membership}`;
    });

    await this.step('api', 'share config', async () => {
      const result = await this.get('/api/share/configs');
      expectStatus(result, 200);
      expectCode0(result);
      assert(result.body.data && result.body.data.default, 'missing default share config');
      return 'default share config returned';
    });

    await this.step('api', 'home banners', async () => {
      const result = await this.get('/api/banners');
      expectStatus(result, 200);
      expectCode0(result);
      assert(Array.isArray(result.body.data), 'banners data is not an array');
      return `${result.body.data.length} banners`;
    });

    await this.step('api', 'jobs list for mini program home and jobs page', async () => {
      const result = await this.get('/api/jobs?page=1&pageSize=3');
      if (result.status === 503) {
        return warn('recruitment feature is disabled; jobs checks skipped');
      }
      expectStatus(result, 200);
      expectCode0(result);
      const list = result.body.data && result.body.data.list;
      assert(Array.isArray(list), 'jobs data.list is not an array');
      this.state.sampleJob = list[0] || null;
      return `${list.length} jobs, source=${result.body.data.source || 'unknown'}`;
    });

    await this.step('api', 'job detail opens from list', async () => {
      if (!this.state.sampleJob || !this.state.sampleJob.id) {
        return warn('no sample job available');
      }
      const result = await this.get(`/api/jobs/${encodeURIComponent(this.state.sampleJob.id)}`);
      expectStatus(result, 200);
      expectCode0(result);
      assert(result.body.data && result.body.data.id, 'job detail missing id');
      return `job=${result.body.data.id}`;
    });

    await this.step('api', 'companies list and detail', async () => {
      const listResult = await this.get('/api/companies?page=1&pageSize=3');
      expectStatus(listResult, 200);
      expectCode0(listResult);
      const list = listResult.body.data && listResult.body.data.list;
      assert(Array.isArray(list), 'companies data.list is not an array');
      if (!list[0] || !list[0].id) return warn('companies list is empty');
      const detailResult = await this.get(`/api/companies/${list[0].id}`);
      expectStatus(detailResult, 200);
      expectCode0(detailResult);
      return `${list.length} companies, detail=${detailResult.body.data.displayName || detailResult.body.data.name}`;
    });

    await this.step('api', 'content discovery endpoints', async () => {
      const endpoints = [
        '/api/experiences?page=1&pageSize=5',
        '/api/campus?page=1&pageSize=5',
        '/api/agencies?page=1&pageSize=5',
        '/api/news?tab=tip&limit=3',
      ];
      const results = [];
      for (const endpoint of endpoints) {
        const result = await this.get(endpoint);
        expectStatus(result, 200);
        results.push(endpoint.split('?')[0]);
      }
      return `${results.length} content endpoints ok`;
    });

    await this.step('security', 'protected applications reject anonymous access', async () => {
      const result = await this.get('/api/applications');
      expectStatus(result, 401);
      return 'anonymous request rejected';
    });

    await this.step('api', 'payment public config', async () => {
      const result = await this.get('/api/payment/config');
      expectStatus(result, 200);
      expectCode0(result);
      this.state.paymentConfig = result.body.data || {};
      return `enabled=${!!this.state.paymentConfig.enabled}, mock=${!!this.state.paymentConfig.mock}`;
    });
  }

  async runWritePathChecks() {
    await this.step('user-flow', 'register test user', async () => {
      const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const email = `acceptance_${unique}@example.com`;
      const phone = `177${Math.floor(10000000 + Math.random() * 90000000)}`;
      this.created.email = email;
      const result = await this.post('/api/users/web-register', {
        nickname: 'Acceptance Bot',
        email,
        phone,
        password: 'acceptance_password_123',
      });
      expectStatus(result, 200);
      expectCode0(result);
      assert(result.body.data && result.body.data.token, 'missing auth token');
      this.state.authToken = result.body.data.token;
      this.created.userId = result.body.data.user && result.body.data.user.id;
      return `user=${this.created.userId || email}`;
    });

    await this.step('user-flow', 'login test user', async () => {
      const result = await this.post('/api/users/web-login', {
        account: this.created.email,
        password: 'acceptance_password_123',
      });
      expectStatus(result, 200);
      expectCode0(result);
      assert(result.body.data && result.body.data.token, 'missing login token');
      this.state.authToken = result.body.data.token;
      return 'login token returned';
    });

    await this.step('user-flow', 'profile read and update', async () => {
      const before = await this.get('/api/users/profile', this.authHeaders());
      expectStatus(before, 200);
      expectCode0(before);
      const update = await this.put('/api/users/profile', {
        nickname: 'Acceptance Bot Updated',
        education: {
          school: 'Acceptance University',
          major: 'Computer Science',
          degree: 'MS',
          gradYear: '2026',
        },
        jobPreference: {
          targetRoles: ['Software Engineer'],
          targetLocation: 'United States',
          status: 'actively_applying',
        },
      }, this.authHeaders());
      expectStatus(update, 200);
      expectCode0(update);
      return 'profile updated';
    });

    await this.step('user-flow', 'resume create update and detail', async () => {
      const created = await this.post('/api/resumes', {
        name: 'Acceptance Resume',
        language: 'zh',
        data: {
          basicInfo: { name: 'Acceptance Bot', email: this.created.email },
          skills: ['JavaScript', 'SQL', 'Product Sense'],
        },
      }, this.authHeaders());
      expectStatus(created, 200);
      expectCode0(created);
      this.created.resumeId = created.body.data && created.body.data.id;
      assert(this.created.resumeId, 'resume id missing');

      const detail = await this.get(`/api/resumes/${this.created.resumeId}`, this.authHeaders());
      expectStatus(detail, 200);
      expectCode0(detail);

      const updated = await this.put(`/api/resumes/${this.created.resumeId}`, {
        name: 'Acceptance Resume v2',
        data: { skills: ['JavaScript', 'SQL', 'Testing'] },
      }, this.authHeaders());
      expectStatus(updated, 200);
      expectCode0(updated);
      return `resume=${this.created.resumeId}`;
    });

    await this.step('user-flow', 'favorite add check remove', async () => {
      const job = this.state.sampleJob || { id: 'acceptance-job', title: 'Acceptance Job', company: 'Acceptance Co' };
      const created = await this.post('/api/favorites', {
        type: 'job',
        targetId: String(job.id),
        title: job.title || 'Acceptance Job',
        subtitle: job.company || '',
      }, this.authHeaders());
      expectStatus(created, 200);
      expectCode0(created);

      const check = await this.get(`/api/favorites/check?type=job&targetId=${encodeURIComponent(String(job.id))}`, this.authHeaders());
      expectStatus(check, 200);
      expectCode0(check);
      assert(check.body.data && check.body.data.isFavorited === true, 'favorite check did not return true');

      const removed = await this.delete('/api/favorites', { type: 'job', targetId: String(job.id) }, this.authHeaders());
      expectStatus(removed, 200);
      expectCode0(removed);
      return `favorite target=${job.id}`;
    });

    await this.step('user-flow', 'application create track list delete', async () => {
      const job = this.state.sampleJob || { id: `acceptance-${Date.now()}`, title: 'Acceptance Job', company: 'Acceptance Co' };
      const created = await this.post('/api/applications', {
        jobId: String(job.id),
        resumeId: this.created.resumeId,
        jobSnapshot: {
          title: job.title || 'Acceptance Job',
          company: job.company || 'Acceptance Co',
          location: job.location || '',
        },
      }, this.authHeaders());
      expectStatus(created, 200);
      expectCode0(created);
      this.created.applicationId = created.body.data && created.body.data.id;
      assert(this.created.applicationId, 'application id missing');

      const list = await this.get('/api/applications', this.authHeaders());
      expectStatus(list, 200);
      expectCode0(list);
      assert(Array.isArray(list.body.data && list.body.data.list), 'application list missing');

      const tracked = await this.put(`/api/applications/${this.created.applicationId}/track`, { tracking: 1 }, this.authHeaders());
      expectStatus(tracked, 200);
      expectCode0(tracked);

      const deleted = await this.delete(`/api/applications/${this.created.applicationId}`, null, this.authHeaders());
      expectStatus(deleted, 200);
      expectCode0(deleted);
      this.created.applicationId = null;
      return 'application lifecycle ok';
    });

    await this.step('user-flow', 'AI validation rejects bad chat payload without calling upstream', async () => {
      const result = await this.post('/api/ai/chat', { messages: [] }, this.authHeaders());
      expectStatus(result, 400);
      assert(result.body && result.body.code === -1, 'expected standard error response');
      return 'invalid AI payload rejected';
    });

    await this.step('user-flow', 'mock payment order confirm verify', async () => {
      if (!this.state.paymentConfig || !this.state.paymentConfig.mock) {
        return warn('mock payment is not enabled; payment write-flow skipped');
      }
      const created = await this.post('/api/payment/create-order', { planId: 0 }, this.authHeaders());
      expectStatus(created, 200);
      expectCode0(created);
      this.created.orderNo = created.body.data && created.body.data.orderNo;
      assert(this.created.orderNo, 'orderNo missing');

      const confirmed = await this.post('/api/payment/mock-confirm', { orderNo: this.created.orderNo }, this.authHeaders());
      expectStatus(confirmed, 200);
      expectCode0(confirmed);

      const verified = await this.get(`/api/payment/verify/${encodeURIComponent(this.created.orderNo)}`, this.authHeaders());
      expectStatus(verified, 200);
      expectCode0(verified);
      assert(verified.body.data && verified.body.data.status === 'paid', 'payment is not paid');
      return `order=${this.created.orderNo}`;
    });
  }

  authHeaders() {
    return { Authorization: `Bearer ${this.state.authToken}` };
  }

  async get(endpoint, headers) {
    return this.request('GET', endpoint, undefined, headers);
  }

  async post(endpoint, body, headers) {
    return this.request('POST', endpoint, body, headers);
  }

  async put(endpoint, body, headers) {
    return this.request('PUT', endpoint, body, headers);
  }

  async delete(endpoint, body, headers) {
    return this.request('DELETE', endpoint, body, headers);
  }

  async request(method, endpoint, body, headers = {}) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          ...(body !== undefined && body !== null ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          parsed = null;
        }
      }
      return {
        status: res.status,
        ok: res.ok,
        text,
        body: parsed,
        durationMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async step(group, name, fn) {
    const record = { group, name, status: 'PASS', detail: '', durationMs: 0 };
    const started = Date.now();
    try {
      const result = await fn();
      if (result && result.status === 'WARN') {
        record.status = 'WARN';
        record.detail = result.detail || '';
      } else {
        record.detail = result || '';
      }
    } catch (err) {
      record.status = 'FAIL';
      record.detail = err && err.stack ? firstLine(err.stack) : String(err);
    } finally {
      record.durationMs = Date.now() - started;
      this.steps.push(record);
      this.printStep(record);
    }
  }

  skip(group, name, detail) {
    const record = { group, name, status: 'SKIP', detail, durationMs: 0 };
    this.steps.push(record);
    this.printStep(record);
  }

  printStep(record) {
    const line = `[${record.status}] ${record.group} :: ${record.name} (${record.durationMs}ms)`;
    if (record.status === 'FAIL' || this.options.verbose) {
      console.log(`${line}${record.detail ? ` - ${record.detail}` : ''}`);
    } else {
      console.log(line);
    }
  }

  async cleanup() {
    if (this.mode === 'local' && this.db && !this.options.keepData && this.created.email) {
      try {
        const user = this.db.prepare('SELECT id FROM users WHERE email = ?').get(this.created.email);
        if (user) {
          const userId = user.id;
          const tables = [
            'orders',
            'applications',
            'favorites',
            'messages',
            'feedbacks',
            'resumes',
            'resume_pdfs',
            'application_materials',
            'jd_match_reports',
            'interview_notebook',
            'interview_daily_practice',
            'ai_usage',
          ];
          for (const table of tables) {
            try {
              this.db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
            } catch (err) {
              // Some older local DBs may not have every optional table.
            }
          }
          this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        }
      } catch (err) {
        this.steps.push({
          group: 'cleanup',
          name: 'remove local test data',
          status: 'WARN',
          detail: err.message,
          durationMs: 0,
        });
      }
    }

    if (this.mode === 'local' && this.featureFlags) {
      try {
        if (Object.prototype.hasOwnProperty.call(this.previousFlags, 'recruitment')) {
          this.featureFlags.updateFeatureFlag('recruitment', this.previousFlags.recruitment);
        }
        if (Object.prototype.hasOwnProperty.call(this.previousFlags, 'membership')) {
          this.featureFlags.updateFeatureFlag('membership', this.previousFlags.membership);
        }
      } catch (err) {
        this.steps.push({
          group: 'cleanup',
          name: 'restore local feature flags',
          status: 'WARN',
          detail: err.message,
          durationMs: 0,
        });
      }
    }

    if (this.server) {
      await new Promise(resolve => this.server.close(resolve));
    }
    if (this.mode === 'local' && this.db && typeof this.db.close === 'function') {
      try {
        this.db.close();
      } catch (err) {
        // The process can still exit; this is only best-effort cleanup.
      }
    }
  }

  buildReport(startedAt) {
    const summary = this.steps.reduce((acc, step) => {
      const key = step.status.toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { pass: 0, fail: 0, warn: 0, skip: 0 });
    return {
      generatedAt: new Date().toISOString(),
      startedAt: startedAt.toISOString(),
      baseUrl: this.baseUrl,
      mode: this.mode,
      writeEnabled: this.options.write,
      summary: {
        passed: summary.pass || 0,
        failed: summary.fail || 0,
        warned: summary.warn || 0,
        skipped: summary.skip || 0,
        total: this.steps.length,
      },
      steps: this.steps,
    };
  }

  writeReport(report) {
    fs.mkdirSync(this.options.reportDir, { recursive: true });
    const stamp = report.generatedAt.replace(/[:.]/g, '-');
    const jsonPath = path.join(this.options.reportDir, `acceptance-${stamp}.json`);
    const mdPath = path.join(this.options.reportDir, `acceptance-${stamp}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdownReport(report));
    report.reportPaths = { jsonPath, mdPath };
  }

  printSummary(report) {
    const { summary } = report;
    console.log('');
    console.log(`Acceptance bot finished: ${summary.passed} passed, ${summary.failed} failed, ${summary.warned} warned, ${summary.skipped} skipped.`);
    if (report.reportPaths) {
      console.log(`Markdown report: ${report.reportPaths.mdPath}`);
      console.log(`JSON report: ${report.reportPaths.jsonPath}`);
    }
  }
}

function renderMarkdownReport(report) {
  const lines = [
    '# Acceptance Bot Report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Mode: ${report.mode}`,
    `- Base URL: ${report.baseUrl}`,
    `- Write checks: ${report.writeEnabled ? 'enabled' : 'disabled'}`,
    `- Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.warned} warned, ${report.summary.skipped} skipped`,
    '',
    '| Status | Group | Check | Duration | Detail |',
    '|---|---|---|---:|---|',
  ];
  for (const step of report.steps) {
    lines.push(`| ${step.status} | ${escapeTable(step.group)} | ${escapeTable(step.name)} | ${step.durationMs}ms | ${escapeTable(step.detail || '')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runCheckMiniprogramInProcess() {
  const scriptPath = path.join(ROOT, 'scripts', 'check-miniprogram.js');
  const previousExit = process.exit;
  const previousExitCode = process.exitCode;
  const previousLog = console.log;
  const previousError = console.error;
  const captured = [];
  let interceptedExitCode = 0;

  function capture(args) {
    captured.push(args.map(value => String(value)).join(' '));
  }

  console.log = (...args) => capture(args);
  console.error = (...args) => capture(args);
  process.exitCode = 0;
  process.exit = (code = 0) => {
    interceptedExitCode = Number(code) || 0;
    const err = new Error(`check-miniprogram exited with code ${interceptedExitCode}`);
    err.code = 'CHECK_MINIPROGRAM_EXIT';
    throw err;
  };

  let unexpectedError = null;
  try {
    delete require.cache[require.resolve(scriptPath)];
    require(scriptPath);
  } catch (err) {
    if (!err || err.code !== 'CHECK_MINIPROGRAM_EXIT') {
      unexpectedError = err;
    }
  } finally {
    console.log = previousLog;
    console.error = previousError;
    process.exit = previousExit;
  }

  const finalCode = interceptedExitCode || process.exitCode || 0;
  process.exitCode = previousExitCode;
  if (unexpectedError) throw unexpectedError;
  const output = captured.join('\n');
  if (finalCode !== 0) {
    throw new Error(lastLines(output, 20) || `check-miniprogram failed with code ${finalCode}`);
  }
  return output;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectStatus(result, expected) {
  const list = Array.isArray(expected) ? expected : [expected];
  assert(list.includes(result.status), `expected HTTP ${list.join(' or ')}, got ${result.status}: ${preview(result)}`);
}

function expectCode0(result) {
  assert(result.body && result.body.code === 0, `expected code=0, got ${preview(result)}`);
}

function preview(result) {
  if (!result) return '<no result>';
  if (result.body) return JSON.stringify(result.body).slice(0, 300);
  return String(result.text || '').slice(0, 300);
}

function warn(detail) {
  return { status: 'WARN', detail };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/)[0];
}

function lastLines(value, count) {
  return String(value || '').split(/\r?\n/).filter(Boolean).slice(-count).join(' | ');
}

function escapeTable(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  if (options.help) {
    printHelp();
    return;
  }
  const bot = new AcceptanceBot(options);
  const exitCode = await bot.run();
  process.exit(exitCode);
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
