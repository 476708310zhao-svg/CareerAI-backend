// Explicit manual or scheduler-invoked local-job link check. No cron registration here.
const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write('用法: node scripts/check_job_apply_links.js (--run | --scheduled) [--limit 1-20]\n' +
    '--scheduled 还需 JOB_LINK_CHECK_SCHEDULE_ENABLED=1；本脚本不会自行安装定时任务。\n');
  process.exit(0);
}
const limitIndex = args.indexOf('--limit');
const limit = limitIndex === -1 ? 10 : Number(args[limitIndex + 1]);
const mode = args.includes('--scheduled') ? '--scheduled' : '--run';
const expected = limitIndex === -1 ? [mode] : [mode, '--limit', args[limitIndex + 1]];
if ((!args.includes('--run') && !args.includes('--scheduled')) ||
    (args.includes('--run') && args.includes('--scheduled')) || args.length !== expected.length ||
    args.some(value => !expected.includes(value)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
  process.stderr.write('需要显式 --run 或 --scheduled；--limit 必须为 1 到 20。查看 --help。\n');
  process.exit(2);
}
if (mode === '--scheduled' && process.env.JOB_LINK_CHECK_SCHEDULE_ENABLED !== '1') {
  process.stdout.write(`${JSON.stringify({ status: 'failed', reason: 'schedule_disabled' })}\n`);
  process.exit(2);
}

async function main() {
  if (mode === '--scheduled') {
    const { runScheduledLinkCheck } = require('../services/jobApplyLinkSchedule');
    const result = await runScheduledLinkCheck({ limit });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status === 'failed') process.exitCode = 1;
    return;
  }
  const { runLinkCheckBatch } = require('../services/jobApplyLinkHealth');
  process.stdout.write(`${JSON.stringify(await runLinkCheckBatch({ limit }))}\n`);
}

main().catch(error => {
  process.stderr.write(`岗位申请链接检查失败：${error.code || error.name || 'unknown'}\n`);
  if (mode === '--scheduled') process.stdout.write(`${JSON.stringify({ status: 'failed', reason: 'storage_error' })}\n`);
  process.exitCode = 1;
});
