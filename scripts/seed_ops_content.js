#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../db/database');

const ROOT = path.join(__dirname, '..');
const DEFAULT_SEED_FILE = path.join(ROOT, 'data', 'ops-content.seed.json');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const seedFileArg = process.argv.find(arg => arg.startsWith('--file='));
const seedFile = seedFileArg ? path.resolve(ROOT, seedFileArg.slice('--file='.length)) : DEFAULT_SEED_FILE;

function readSeed(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  return {
    version: data.version || '',
    interviewQuestions: Array.isArray(data.interviewQuestions) ? data.interviewQuestions : [],
    starTemplates: Array.isArray(data.starTemplates) ? data.starTemplates : [],
    announcements: Array.isArray(data.announcements) ? data.announcements : []
  };
}

function jsonList(value) {
  if (Array.isArray(value)) return JSON.stringify(value.filter(Boolean).map(String));
  if (typeof value === 'string' && value.trim()) {
    return JSON.stringify(value.split(/[,\n，]/).map(item => item.trim()).filter(Boolean));
  }
  return '[]';
}

function booleanFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function requiredString(value, field, id) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field} is required for ${id || 'seed item'}`);
  return text;
}

const findQuestion = db.prepare('SELECT id FROM interview_questions WHERE question_id = ?');
const upsertQuestion = db.prepare(`
  INSERT INTO interview_questions
    (question_id, title, answer, category, difficulty, tags, views, source,
     is_featured, is_published, sort_order, updated_at)
  VALUES
    (@question_id, @title, @answer, @category, @difficulty, @tags, @views, @source,
     @is_featured, @is_published, @sort_order, datetime('now'))
  ON CONFLICT(question_id) DO UPDATE SET
    title=excluded.title,
    answer=excluded.answer,
    category=excluded.category,
    difficulty=excluded.difficulty,
    tags=excluded.tags,
    views=excluded.views,
    source=excluded.source,
    is_featured=excluded.is_featured,
    is_published=excluded.is_published,
    sort_order=excluded.sort_order,
    updated_at=datetime('now')
`);

const findTemplate = db.prepare('SELECT id FROM star_templates WHERE template_id = ?');
const upsertTemplate = db.prepare(`
  INSERT INTO star_templates
    (template_id, role, role_label, role_color, title, tags, situation, task, action, result,
     is_published, sort_order, updated_at)
  VALUES
    (@template_id, @role, @role_label, @role_color, @title, @tags, @situation, @task, @action, @result,
     @is_published, @sort_order, datetime('now'))
  ON CONFLICT(template_id) DO UPDATE SET
    role=excluded.role,
    role_label=excluded.role_label,
    role_color=excluded.role_color,
    title=excluded.title,
    tags=excluded.tags,
    situation=excluded.situation,
    task=excluded.task,
    action=excluded.action,
    result=excluded.result,
    is_published=excluded.is_published,
    sort_order=excluded.sort_order,
    updated_at=datetime('now')
`);

const findAnnouncement = db.prepare('SELECT id FROM announcements WHERE title = ?');
const insertAnnouncement = db.prepare(`
  INSERT INTO announcements
    (
      title, content, category, cover_url, summary, tags, target_roles, target_regions,
      action_type, action_label, action_url, source_url, sort_order,
      is_pinned, is_published, created_at, updated_at
    )
  VALUES
    (
      @title, @content, @category, @cover_url, @summary, @tags, @target_roles, @target_regions,
      @action_type, @action_label, @action_url, @source_url, @sort_order,
      @is_pinned, @is_published, @created_at, @updated_at
    )
`);
const updateAnnouncement = db.prepare(`
  UPDATE announcements SET
    content=@content,
    category=@category,
    cover_url=@cover_url,
    summary=@summary,
    tags=@tags,
    target_roles=@target_roles,
    target_regions=@target_regions,
    action_type=@action_type,
    action_label=@action_label,
    action_url=@action_url,
    source_url=@source_url,
    sort_order=@sort_order,
    is_pinned=@is_pinned,
    is_published=@is_published,
    updated_at=@updated_at
  WHERE id=@id
`);

function normalizeQuestion(item, index) {
  const questionId = requiredString(item.questionId || item.question_id, 'questionId', `question ${index + 1}`);
  return {
    question_id: questionId,
    title: requiredString(item.title || item.question, 'title', questionId),
    answer: String(item.answer || ''),
    category: String(item.category || 'behavior'),
    difficulty: String(item.difficulty || '中等'),
    tags: jsonList(item.tags),
    views: Number(item.views) || 0,
    source: String(item.source || 'ops-seed'),
    is_featured: booleanFlag(item.isFeatured || item.is_featured) ? 1 : 0,
    is_published: item.isPublished === false || item.is_published === false ? 0 : 1,
    sort_order: Number(item.sortOrder || item.sort_order) || 0
  };
}

function normalizeTemplate(item, index) {
  const templateId = requiredString(item.templateId || item.template_id, 'templateId', `template ${index + 1}`);
  return {
    template_id: templateId,
    role: String(item.role || 'general'),
    role_label: String(item.roleLabel || item.role_label || '通用'),
    role_color: String(item.roleColor || item.role_color || '#6B7280'),
    title: requiredString(item.title, 'title', templateId),
    tags: jsonList(item.tags),
    situation: String(item.situation || ''),
    task: String(item.task || ''),
    action: String(item.action || ''),
    result: String(item.result || ''),
    is_published: item.isPublished === false || item.is_published === false ? 0 : 1,
    sort_order: Number(item.sortOrder || item.sort_order) || 0
  };
}

function normalizeAnnouncement(item, index) {
  const title = requiredString(item.title, 'title', `announcement ${index + 1}`);
  const createdAt = String(item.createdAt || item.created_at || new Date().toISOString());
  return {
    title,
    content: requiredString(item.content || item.body, 'content', title),
    category: String(item.category || '资讯'),
    cover_url: String(item.coverUrl || item.cover_url || ''),
    summary: String(item.summary || item.desc || ''),
    tags: jsonList(item.tags),
    target_roles: jsonList(item.targetRoles || item.target_roles),
    target_regions: jsonList(item.targetRegions || item.target_regions),
    action_type: String(item.actionType || item.action_type || ''),
    action_label: String(item.actionLabel || item.action_label || ''),
    action_url: String(item.actionUrl || item.action_url || ''),
    source_url: String(item.sourceUrl || item.source_url || ''),
    sort_order: Number(item.sortOrder || item.sort_order) || 0,
    is_pinned: booleanFlag(item.isPinned || item.is_pinned) ? 1 : 0,
    is_published: item.isPublished === false || item.is_published === false ? 0 : 1,
    created_at: createdAt,
    updated_at: String(item.updatedAt || item.updated_at || createdAt)
  };
}

function seed() {
  const seedData = readSeed(seedFile);
  const summary = {
    file: seedFile,
    version: seedData.version,
    dryRun,
    questions: { inserted: 0, updated: 0, total: seedData.interviewQuestions.length },
    starTemplates: { inserted: 0, updated: 0, total: seedData.starTemplates.length },
    announcements: { inserted: 0, updated: 0, total: seedData.announcements.length }
  };

  const questions = seedData.interviewQuestions.map(normalizeQuestion);
  const templates = seedData.starTemplates.map(normalizeTemplate);
  const announcements = seedData.announcements.map(normalizeAnnouncement);

  const run = db.transaction(() => {
    questions.forEach(item => {
      const exists = findQuestion.get(item.question_id);
      if (exists) summary.questions.updated += 1;
      else summary.questions.inserted += 1;
      upsertQuestion.run(item);
    });

    templates.forEach(item => {
      const exists = findTemplate.get(item.template_id);
      if (exists) summary.starTemplates.updated += 1;
      else summary.starTemplates.inserted += 1;
      upsertTemplate.run(item);
    });

    announcements.forEach(item => {
      const exists = findAnnouncement.get(item.title);
      if (exists) {
        summary.announcements.updated += 1;
        updateAnnouncement.run(Object.assign({ id: exists.id }, item));
      } else {
        summary.announcements.inserted += 1;
        insertAnnouncement.run(item);
      }
    });
  });

  if (!dryRun) run();
  else {
    questions.forEach(item => {
      if (findQuestion.get(item.question_id)) summary.questions.updated += 1;
      else summary.questions.inserted += 1;
    });
    templates.forEach(item => {
      if (findTemplate.get(item.template_id)) summary.starTemplates.updated += 1;
      else summary.starTemplates.inserted += 1;
    });
    announcements.forEach(item => {
      if (findAnnouncement.get(item.title)) summary.announcements.updated += 1;
      else summary.announcements.inserted += 1;
    });
  }

  summary.after = {
    questions: db.prepare('SELECT COUNT(*) AS c FROM interview_questions WHERE is_published = 1').get().c,
    starTemplates: db.prepare('SELECT COUNT(*) AS c FROM star_templates WHERE is_published = 1').get().c,
    announcements: db.prepare('SELECT COUNT(*) AS c FROM announcements WHERE is_published = 1').get().c
  };
  return summary;
}

try {
  const summary = seed();
  console.log(JSON.stringify(summary, null, 2));
} catch (err) {
  console.error('[seed_ops_content] failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
}
