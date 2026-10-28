function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

const SOURCE_POLICIES = Object.freeze({
  jsearch: {
    ttlMs: 30 * 60_000, minIntervalMs: 1_000,
    dailyBudget: positiveInteger(process.env.JSEARCH_DAILY_REQUEST_BUDGET, 6)
  },
  adzuna: { ttlMs: 15 * 60_000, minIntervalMs: 500 },
  themuse: { ttlMs: 15 * 60_000, minIntervalMs: 500 },
  remoteok: { ttlMs: 5 * 60_000, minIntervalMs: 1_000 },
  linkedin: { ttlMs: 15 * 60_000, minIntervalMs: 1_000 },
  indeed: { ttlMs: 15 * 60_000, minIntervalMs: 1_000 }
});

class JobSourceUnavailableError extends Error {
  constructor(source, reason, status = 0) {
    super(`${source} unavailable (${reason}${status ? ` ${status}` : ''})`);
    this.name = 'JobSourceUnavailableError';
    this.source = source;
    this.reason = reason;
    this.status = status;
  }
}

function retryAfterMs(headers, now) {
  const header = name => {
    if (typeof headers?.get === 'function') return headers.get(name);
    const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name);
    return entry && entry[1];
  };
  const value = header('retry-after');
  if (value !== undefined) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  const reset = Number(header('x-ratelimit-requests-reset'));
  return Number.isFinite(reset) && reset > 0 ? reset * 1_000 : 0;
}

function createJobSourceGateway(options = {}) {
  const now = options.now || Date.now;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const maxEntries = options.maxEntries || 200;
  const cache = new Map();
  const sources = new Map();

  function sourceState(source) {
    if (!sources.has(source)) {
      sources.set(source, {
        tail: Promise.resolve(), inFlight: new Map(), cooldownUntil: 0,
        nextRequestAt: 0, consecutiveFailures: 0,
        budgetDay: '', requestsToday: 0, budgetWarned: false
      });
    }
    return sources.get(source);
  }

  async function request(source, key, fetcher, policy = {}) {
    const config = { ...(SOURCE_POLICIES[source] || {}), ...policy };
    const requestCost = positiveInteger(config.requestCost, 1);
    const cacheKey = `${source}:${key}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.value;

    const state = sourceState(source);
    if (state.inFlight.has(cacheKey)) return state.inFlight.get(cacheKey);

    let releaseTurn;
    const turn = new Promise(resolve => { releaseTurn = resolve; });
    const previous = state.tail;
    state.tail = turn;

    const pending = (async () => {
      await previous;
      try {
        // A preceding request may have filled the cache or opened the circuit.
        const current = cache.get(cacheKey);
        if (current && current.expiresAt > now()) return current.value;
        if (state.cooldownUntil > now()) {
          throw new JobSourceUnavailableError(source, 'cooldown');
        }
        const day = new Date(now()).toISOString().slice(0, 10);
        if (state.budgetDay !== day) {
          state.budgetDay = day;
          state.requestsToday = 0;
          state.budgetWarned = false;
        }
        if (config.dailyBudget && state.requestsToday + requestCost > config.dailyBudget) {
          if (!state.budgetWarned) {
            console.warn(`[jobs/source] ${source} daily request budget reached`);
            state.budgetWarned = true;
          }
          throw new JobSourceUnavailableError(source, 'budget_exhausted');
        }
        if (state.nextRequestAt > now()) await sleep(state.nextRequestAt - now());
        state.nextRequestAt = now() + (config.minIntervalMs || 0);
        state.requestsToday += requestCost;

        try {
          const value = await fetcher();
          state.consecutiveFailures = 0;
          if ((config.ttlMs || 0) > 0) {
            cache.delete(cacheKey);
            cache.set(cacheKey, { value, expiresAt: now() + config.ttlMs });
            if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
          }
          return value;
        } catch (error) {
          const status = Number(error?.response?.status) || 0;
          state.consecutiveFailures += 1;
          if (status === 429 || status === 403) {
            const defaultDelay = status === 429 ? 15 * 60_000 : 60 * 60_000;
            const hintedDelay = retryAfterMs(error.response?.headers, now());
            state.cooldownUntil = now() + Math.min(24 * 60 * 60_000, Math.max(defaultDelay, hintedDelay));
          } else if (state.consecutiveFailures >= 3) {
            state.cooldownUntil = now() + 2 * 60_000;
          }
          throw new JobSourceUnavailableError(source, status === 429 ? 'rate_limited' : 'upstream_error', status);
        }
      } finally {
        releaseTurn();
        state.inFlight.delete(cacheKey);
      }
    })();
    state.inFlight.set(cacheKey, pending);
    return pending;
  }

  return { request };
}

module.exports = { createJobSourceGateway, JobSourceUnavailableError, retryAfterMs };
