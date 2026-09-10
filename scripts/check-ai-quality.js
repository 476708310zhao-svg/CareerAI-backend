const corpus = require('../tests/fixtures/ai-quality-samples.json');
const { runQualityGate } = require('../tests/helpers/aiQualityGate');

runQualityGate(corpus).then(report => {
  console.log('[ai-quality] anonymized samples:', report.summary.sampleCount);
  console.log('[ai-quality] fault matrix:', `${report.summary.faultScenariosPassed}/${report.summary.faultScenarios}`);
  console.log('[ai-quality] external requests:', report.summary.externalRequests);
  console.log('[ai-quality] token usage probe:', JSON.stringify(report.successProbe.metadata));
  if (!report.passed) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log('[ai-quality] PASS');
}).catch(error => {
  console.error('[ai-quality] failed:', error.message);
  process.exitCode = 1;
});
