const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EVENT_VERSION,
  FUNNEL_STAGES,
  normalizeDataClass,
  inferDataClass,
  stageForEvent,
  eventForApplicationStatus,
  prepareFunnelPayload
} = require('../utils/funnelAnalytics');

test('job funnel keeps the canonical seven-stage order', () => {
  assert.deepEqual(FUNNEL_STAGES.map(item => item.eventName), [
    'job_viewed',
    'job_matched',
    'resume_optimized',
    'application_added',
    'application_submitted',
    'interview_reached',
    'offer_received'
  ]);
  assert.equal(stageForEvent('resume_optimized').label, '确认简历版本');
  assert.equal(stageForEvent('official_apply_clicked'), null);
});

test('application statuses map only to real recruiting funnel stages', () => {
  assert.equal(eventForApplicationStatus('applied'), 'application_submitted');
  assert.equal(eventForApplicationStatus('online_apply'), 'application_submitted');
  assert.equal(eventForApplicationStatus('phone_screen'), 'interview_reached');
  assert.equal(eventForApplicationStatus('interview_2'), 'interview_reached');
  assert.equal(eventForApplicationStatus('offer'), 'offer_received');
  assert.equal(eventForApplicationStatus('preparing'), '');
  assert.equal(eventForApplicationStatus('interview_training_completed'), '');
});

test('funnel payloads include versioned refs and expose missing required refs', () => {
  const complete = prepareFunnelPayload(7, 'application_added', {
    jobId: 'local-job-7',
    applicationId: 42
  });
  assert.equal(complete.eventVersion, EVENT_VERSION);
  assert.equal(complete.funnelStage, 'application_added');
  assert.deepEqual(complete.refs, { userId: 7, jobId: 'local-job-7', applicationId: 42 });
  assert.deepEqual(complete.missingRefs, []);

  const incomplete = prepareFunnelPayload(7, 'resume_optimized', { resumeId: 8 });
  assert.deepEqual(incomplete.missingRefs, ['resumeVersionId']);
  assert.throws(() => prepareFunnelPayload(7, 'page_view', {}), /未知漏斗事件/);
});

test('analytics data classes isolate smoke and demo identifiers without flagging local jobs', () => {
  assert.equal(normalizeDataClass('INVALID'), 'production');
  assert.equal(inferDataClass({ environment: 'test' }), 'test');
  assert.equal(inferDataClass({ explicit: 'system' }), 'system');
  assert.equal(inferDataClass({ source: 'smoke-suite' }), 'test');
  assert.equal(inferDataClass({ payload: { jobId: 'mock_job_1' } }), 'demo');
  assert.equal(inferDataClass({ payload: { refs: { resumeVersionId: 'fixture-version' } } }), 'test');
  assert.equal(inferDataClass({ payload: { jobId: 'default-job' } }), 'demo');
  assert.equal(inferDataClass({ payload: { jobId: 'local-job-1' } }), 'production');
});
