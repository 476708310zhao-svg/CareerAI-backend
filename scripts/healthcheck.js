const baseUrl = String(process.env.HEALTHCHECK_BASE_URL || 'http://127.0.0.1:4400').replace(/\/$/, '');
function boundedMs(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum} milliseconds`);
  }
  return value;
}

const timeoutMs = boundedMs('HEALTHCHECK_TIMEOUT_MS', 5000, 100, 10000);
const deadlineMs = boundedMs('HEALTHCHECK_DEADLINE_MS', 30000, 100, 60000);
const retryDelayMs = boundedMs('HEALTHCHECK_RETRY_DELAY_MS', 1000, 10, 5000);

async function checkOnce(remainingMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remainingMs));
  try {
    const response = await fetch(`${baseUrl}/api/health/ready`, { signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ready !== true) {
      throw new Error(`readiness failed (${response.status})`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const deadlineAt = Date.now() + deadlineMs;
  let attempts = 0;
  let lastError = null;

  while (Date.now() < deadlineAt) {
    attempts += 1;
    try {
      await checkOnce(deadlineAt - Date.now());
      console.log(`[healthcheck] ready: ${baseUrl} (${attempts} attempt${attempts === 1 ? '' : 's'})`);
      return;
    } catch (error) {
      lastError = error;
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(retryDelayMs, remainingMs)));
    }
  }

  throw new Error(`readiness did not succeed within ${deadlineMs}ms: ${lastError?.message || 'unknown error'}`);
}

main().catch(error => {
  console.error(`[healthcheck] ${error.message}`);
  process.exitCode = 1;
});
