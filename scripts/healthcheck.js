const baseUrl = String(process.env.HEALTHCHECK_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 5000);

async function main() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/health/ready`, { signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ready !== true) {
      throw new Error(`readiness failed (${response.status}): ${JSON.stringify(body)}`);
    }
    console.log(`[healthcheck] ready: ${baseUrl}`);
  } finally {
    clearTimeout(timer);
  }
}

main().catch(error => {
  console.error(`[healthcheck] ${error.message}`);
  process.exitCode = 1;
});
