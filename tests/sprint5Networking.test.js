'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DRAFT_TYPES, draftCopy } = require('../services/v4Networking');

const contact = {
  name: 'Alex',
  company: 'Example Labs',
  role: 'Data Analyst',
  relationship_context: '参加过同一场公开分享会',
  context_verified: 0
};
const sender = {
  displayName: '测试用户',
  identity: '数据科学硕士',
  target: 'Data Analyst',
  skills: ['SQL', 'Python']
};

test('Sprint 5 supports exactly five editable Networking draft types', () => {
  assert.deepEqual(Object.keys(DRAFT_TYPES), [
    'connect_note', 'cold_message', 'coffee_chat', 'follow_up', 'referral_request'
  ]);
  Object.keys(DRAFT_TYPES).forEach(type => {
    const draft = draftCopy(type, 'zh', 'formal', contact, sender, '想了解真实岗位要求');
    assert.equal(typeof draft.content, 'string');
    assert.ok(draft.content.length > 20);
  });
});

test('Sprint 5 excludes unverified relationship claims from generated drafts', () => {
  const unverified = draftCopy('cold_message', 'zh', 'formal', contact, sender, '想了解团队情况');
  assert.doesNotMatch(unverified.content, /同一场公开分享会/);
  const verified = draftCopy('cold_message', 'zh', 'formal', { ...contact, context_verified: 1 }, sender, '想了解团队情况');
  assert.match(verified.content, /同一场公开分享会/);
});

test('Sprint 5 Referral Request keeps recipient choice explicit', () => {
  const draft = draftCopy('referral_request', 'en', 'formal', contact, sender, 'Could I learn about the hiring process?');
  assert.match(draft.content, /if you know the role and believe/i);
  assert.match(draft.content, /understand if not/i);
  assert.doesNotMatch(draft.content, /you referred me|our alumni connection/i);
});

test('Sprint 5 migration is additive and records CRM, drafts and stage events', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '0003_networking_copilot.sql'), 'utf8');
  for (const table of ['networking_contacts_v4', 'networking_drafts_v4', 'networking_events_v4']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|TRUNCATE|ALTER)\b/im);
});

test('Sprint 5 mini program exposes CRM, editable drafts and explicit external-send confirmation', () => {
  const root = path.join(__dirname, '..', 'miniprogram');
  const page = fs.readFileSync(path.join(root, 'package-career', 'pages', 'networking', 'networking.js'), 'utf8');
  const template = fs.readFileSync(path.join(root, 'package-career', 'pages', 'networking', 'networking.wxml'), 'utf8');
  const resources = fs.readFileSync(path.join(root, 'pages', 'resources', 'resources.js'), 'utf8');
  assert.match(page, /getNetworkingDashboard/);
  assert.match(page, /createNetworkingContact/);
  assert.match(page, /markNetworkingDraftSent/);
  assert.match(page, /confirmExternalSend:\s*true/);
  assert.doesNotMatch(page, /\/api\/ai\/networking/);
  assert.match(template, /系统不会执行外发|不会代替你发送消息/);
  assert.match(resources, /Networking Copilot/);
});
