const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApplicationWorkbench, deadlineMeta } = require('../miniprogram/utils/application-workbench');

const NOW = new Date('2026-07-17T09:00:00+08:00');

test('application workbench builds counts, funnel and material readiness', () => {
  const result = buildApplicationWorkbench([
    { id: 1, group: 'preparing', company: 'Acme', jobTitle: 'SDE', deadline: '2026-07-20', resumeId: 2, coverLetter: 'ready' },
    { id: 2, group: 'interview', company: 'Nova', jobTitle: 'AI Engineer', interviewTime: '2026-07-18 10:00', nextAction: '准备 STAR' },
    { id: 3, group: 'offer', company: 'Orbit', jobTitle: 'Data Scientist' }
  ], NOW);

  assert.equal(result.total, 3);
  assert.equal(result.activeCount, 2);
  assert.equal(result.counts.interview, 1);
  assert.equal(result.counts.offer, 1);
  assert.equal(result.applications.find(item => item.id === 1).materialPercent, 100);
  assert.equal(result.highlights[0].type, 'interview');
  assert.equal(result.funnel.length, 4);
});

test('application workbench prioritizes overdue deadlines and formats urgency', () => {
  const result = buildApplicationWorkbench([
    { id: 1, group: 'applied', company: 'Late', deadline: '2026-07-16' },
    { id: 2, group: 'applied', company: 'Later', deadline: '2026-07-24' }
  ], NOW);

  assert.equal(deadlineMeta('2026-07-16', NOW).label, '已逾期1天');
  assert.equal(result.highlights[0].badge, '逾期');
  assert.equal(result.applications[0].id, 1);
});

test('application workbench formats interview dates beyond tomorrow', () => {
  const result = buildApplicationWorkbench([
    { id: 7, group: 'interview', company: 'Future', interviewTime: '2026-07-20 14:30' }
  ], NOW);

  assert.equal(result.applications[0].interviewLabel, '7月20日 14:30面试');
  assert.equal(result.highlights[0].type, 'interview');
});
