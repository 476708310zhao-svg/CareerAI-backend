# Acceptance Bot

The acceptance bot is a one-command smoke and release acceptance runner for the mini program backend and the mini program package metadata.

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
npm run bot:acceptance -- --base-url https://api.example.com --read-only
```

Checks a running environment without write-path actions. Add `--write` only for disposable staging environments.

## Coverage

- Mini program metadata: `app.json`, page file presence, tab bar assets, and project compile type.
- Public API readiness: health, feature flags, share config, banners, jobs, job detail, companies, content discovery, payment config.
- Security guardrails: anonymous protected application access must return `401`.
- Local write journeys: web register/login, profile update, resume CRUD basics, favorites, application lifecycle, AI input validation, and mock payment confirmation.

## Notes

- The bot never calls real AI generation endpoints with valid prompts.
- The default local run uses mock payment only.
- External runs are read-only unless `--write` is passed.
- Generated reports are ignored by git.
