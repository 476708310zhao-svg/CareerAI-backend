const test = require('node:test');
const assert = require('node:assert/strict');

const {
  positiveId,
  canonicalJobId,
  applicationRefs,
  mergeCoreRefs,
  withCoreRefs
} = require('../utils/coreEntityRefs');
const { toV4Status, broadStatus, allowedStatusViews } = require('../utils/applicationStatus');

test('core entity refs prefer the official source job id', () => {
  assert.equal(canonicalJobId({ job_id: 'client-local-id', source_job_id: 'official-job-id' }), 'official-job-id');
  assert.equal(canonicalJobId({ source_job_id: '  ', job_id: 'job-fallback' }), 'job-fallback');
  assert.equal(canonicalJobId({ jobId: 'job-only' }), 'job-only');
});

test('core entity refs normalize SQLite ids to positive integers', () => {
  assert.equal(positiveId('12'), 12);
  assert.equal(positiveId(12), 12);
  for (const value of ['', null, undefined, 0, -1, 1.5, 'invalid']) {
    assert.equal(positiveId(value), null);
  }
});

test('application refs expose a stable complete reference shape', () => {
  const refs = applicationRefs({
    id: '42', user_id: '7', job_id: 'local-job', source_job_id: 'official-job',
    resume_id: '8', resume_version_id: '9'
  });
  assert.deepEqual(refs, {
    userId: 7,
    jobId: 'official-job',
    applicationId: 42,
    resumeId: 8,
    resumeVersionId: 9,
    interviewSpaceId: null,
    interviewSessionId: null,
    interviewReportId: null,
    todayTaskId: null
  });
});

test('merged refs preserve earlier values when later sources are empty', () => {
  const refs = mergeCoreRefs(
    { userId: 3, jobId: 'job-3', applicationId: 10 },
    { userId: '', jobId: '', applicationId: null, interviewSpaceId: '11' }
  );
  assert.equal(refs.userId, 3);
  assert.equal(refs.jobId, 'job-3');
  assert.equal(refs.applicationId, 10);
  assert.equal(refs.interviewSpaceId, 11);
});

test('analytics refs remain compact while legacy payload fields are retained', () => {
  const payload = withCoreRefs(
    { applicationId: 21, action: 'complete' },
    { userId: 5, applicationId: 21, resumeId: null, jobId: '' }
  );
  assert.deepEqual(payload, {
    applicationId: 21,
    action: 'complete',
    refs: { userId: 5, applicationId: 21 }
  });
});

test('application status contract normalizes legacy values and keeps transitions explicit', () => {
  assert.equal(toV4Status({ progress_status: 'first_interview', status: 'interview' }), 'interview_1');
  assert.equal(toV4Status({ v4_status: 'final', progress_status: 'first_interview' }), 'final');
  assert.equal(toV4Status({ v4_status: 'unknown', progress_status: 'online_apply' }), 'preparing');
  assert.equal(broadStatus('interview_2'), 'interview');
  assert.deepEqual(allowedStatusViews('final').map(item => item.value), ['offer', 'rejected', 'withdrawn']);
});
