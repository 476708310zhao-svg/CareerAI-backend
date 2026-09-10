const baseUrl = String(process.env.HEALTHCHECK_BASE_URL || 'http://127.0.0.1:4400').replace(/\/$/, '');
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 5000);
const deadlineMs = Number(process.env.HEALTHCHECK_DEADLINE_MS || 30000);
const retryDelayMs = Number(process.env.HEALTHCHECK_RETRY_DELAY_MS || 1000);

async function checkOnce() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/health/ready`, { signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ready !== true) {
      throw new Error(`readiness failed (${response.status}): ${JSON.stringify(body)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const startedAt = Date.now();
  let attempts = 0;
  let lastError = null;

  while (Date.now() - startedAt < deadlineMs) {
    attempts += 1;
    try {
      await checkOnce();
      console.log(`[healthcheck] ready: ${baseUrl} (${attempts} attempt${attempts === 1 ? '' : 's'})`);
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() - startedAt >= deadlineMs) break;
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(`readiness did not succeed within ${deadlineMs}ms: ${lastError && lastError.message || 'unknown error'}`);
}

main().catch(error => {
  console.error(`[healthcheck] ${error.message}`);
  process.exitCode = 1;
});
