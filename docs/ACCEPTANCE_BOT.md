# Acceptance Bot

The acceptance bot is a one-command smoke and release acceptance runner for the mini program backend and the mini program package metadata.

Chinese usage guide: `docs/求职线测试机器人使用文档.md`.

## Commands

```bash
npm run bot:acceptance
```

Default mode starts the local backend on a random port, enables safe local mock settings, creates a temporary test user, checks the main user journeys, cleans up the test data, and writes Markdown/JSON reports to `reports/acceptance/`.

```bash
npm run check:acceptance
```

Runs the same bot plus the existing full mini program release checker in `scripts/check-miniprogram.js`.

```bash
npm run bot:career-line
```

Runs the full static acceptance flow with the 2.0 career-line scenarios enabled.

```bash
npm run bot:e2e-3.0
```

Runs the WeChat DevTools automation flow for the 3.0 journey: seeded login, resume upload mock, resume AI polish, JD match, save to progress, progress detail, question AI training, AI interview report, campus reminder, and membership quota page.

```bash
npm run check:e2e-3.0
```

Checks the 3.0 E2E bot setup without launching WeChat DevTools.

Useful 3.0 E2E options:

```bash
npm run bot:e2e-3.0 -- --cli-path "C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat"
npm run bot:e2e-3.0 -- --fresh-devtools
npm run bot:e2e-3.0 -- --ws-endpoint ws://127.0.0.1:9420
```

Before running the real 3.0 DevTools E2E flow, open WeChat DevTools and enable `Settings > Security Settings > Service Port`. If this switch is off, `npm run check:e2e-3.0` reports a warning and the real E2E run exits before waiting on an unreachable automation port.

```bash
npm run bot:acceptance -- --base-url https://api.example.com --read-only
```

Checks a running environment without write-path actions. Add `--write` only for disposable staging environments.

## Coverage

- Mini program metadata: `app.json`, page file presence, tab bar assets, and project compile type.
- Public API readiness: health, feature flags, share config, banners, jobs, job detail, companies, content discovery, payment config.
- Security guardrails: anonymous protected application access must return `401`.
- Local write journeys: web register/login, profile update, resume CRUD basics, favorites, application lifecycle, AI input validation, and mock payment confirmation.
- 2.0 career-line journeys: application materials, JD match reports, interview notebook, daily practice, and reminder dispatch idempotency.
- 3.0 DevTools E2E: mini program page navigation, mocked file upload, AI polish, JD match, progress detail, question training, AI report, campus reminder, and quota page.

## Notes

- The bot never calls real AI generation endpoints with valid prompts.
- The default local run uses mock payment only.
- External runs are read-only unless `--write` is passed.
- The 3.0 DevTools bot mocks WeChat authorization, file picker, subscription messages, upload, and API requests; real-device login, file picker, subscription authorization, and virtual payment popups still need manual verification.
- Generated reports are ignored by git.
