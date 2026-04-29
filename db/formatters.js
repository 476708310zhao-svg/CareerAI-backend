// backend/db/formatters.js
// 统一的数据行格式化函数，供各路由文件 require 使用
// 消除各路由中重复的 format/fmt/formatXxx 函数

const { j, ja } = require('./utils');

// ── 用户 ─────────────────────────────────────────────────────────────────────
function formatUser(row) {
  if (!row) return null;
  return {
    id: row.id, openid: row.openid,
    nickname: row.nickname, avatar: row.avatar,
    email: row.email, phone: row.phone,
    education: j(row.education),
    jobPreference: j(row.job_preference),
    vipLevel: row.vip_level,
    vipExpiresAt: row.vip_expires_at,
    createdAt: row.created_at
  };
}

// ── 面经 ─────────────────────────────────────────────────────────────────────
function formatExperience(e) {
  return {
    id: e.id, userId: e.user_id, userName: e.user_name, userAvatar: e.user_avatar,
    company: e.company, position: e.position, type: e.type, round: e.round,
    title: e.title, content: e.content, tags: ja(e.tags),
    likesCount: e.likes_count, commentsCount: e.comments_count,
    isAnonymous: !!e.is_anonymous, createdAt: e.created_at
  };
}

// ── 评论 ─────────────────────────────────────────────────────────────────────
function formatComment(c, replies) {
  return {
    id: c.id,
    experienceId: c.experience_id,
    userId: c.user_id,
    userName: c.user_name,
    userAvatar: c.user_avatar,
    content: c.content,
    likesCount: c.likes_count,
    createdAt: c.created_at,
    replies: (replies || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      content: r.content,
      createdAt: r.created_at
    }))
  };
}

// ── 投递申请 ─────────────────────────────────────────────────────────────────
function formatApp(a) {
  return {
    id: a.id, userId: a.user_id, jobId: a.job_id,
    jobSnapshot: j(a.job_snapshot), resumeId: a.resume_id,
    status: a.status, statusText: a.status_text,
    appliedAt: a.applied_at, viewedAt: a.viewed_at
  };
}

// ── 薪资 ─────────────────────────────────────────────────────────────────────
function formatSalary(s) {
  return {
    id: s.id, company: s.company, position: s.position,
    location: s.location, yearsOfExperience: s.years_of_experience,
    baseSalary: s.base_salary, bonus: s.bonus, stock: s.stock,
    totalCompensation: s.total_compensation, currency: s.currency,
    createdAt: s.created_at
  };
}

// ── 校招日历 ─────────────────────────────────────────────────────────────────
function formatCampus(s) {
  return {
    id:           s.id,
    company:      s.company,
    companyLogo:  s.company_logo,
    industry:     s.industry || '',
    recruitType:  s.recruit_type || '春招',
    locations:    ja(s.locations),
    positionName: s.position_name || '',
    startDate:    s.start_date || '',
    deadlineDate: s.deadline_date || '',
    writtenTest:  s.written_test || '需要笔试',
    applyUrl:     s.apply_url || '',
    announceUrl:  s.announce_url || '',
    gradYear:     s.grad_year || 2026,
    region:       s.region,
    positionType: s.position_type,
    recruitYear:  s.recruit_year,
    isHot:        s.is_hot === 1,
    notes:        s.notes || '',
    isVerified:   s.is_verified === 1,
    viewCount:    s.view_count,
    createdAt:    s.created_at
  };
}

// ── 求职机构 ─────────────────────────────────────────────────────────────────
function extractDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function formatAgency(a) {
  return {
    id:          a.id,
    name:        a.name,
    type:        a.type,
    description: a.description,
    services:    ja(a.services),
    priceRange:  j(a.price_range),
    specialties: ja(a.specialties),
    website:     a.website,
    phone:       a.phone,
    city:        a.city,
    logo:        a.logo,
    logoDomain:  extractDomain(a.website),
    isVerified:  !!a.is_verified,
    ratingAvg:   a.rating_avg,
    reviewCount: a.review_count,
    aiEval:      a.ai_eval ? j(a.ai_eval) : null,
    aiEvalAt:    a.ai_eval_at,
    createdAt:   a.created_at
  };
}

function formatAgencyReview(r) {
  return {
    id:            r.id,
    agencyId:      r.agency_id,
    userId:        r.is_anonymous ? null : r.user_id,
    userName:      r.is_anonymous ? '匿名用户' : (r.user_name || '用户'),
    userAvatar:    r.is_anonymous ? '' : (r.user_avatar || ''),
    ratingOverall: r.rating_overall,
    ratingEffect:  r.rating_effect,
    ratingValue:   r.rating_value,
    ratingService: r.rating_service,
    title:         r.title,
    content:       r.content,
    pros:          r.pros,
    cons:          r.cons,
    isAnonymous:   !!r.is_anonymous,
    likesCount:    r.likes_count,
    createdAt:     r.created_at
  };
}

module.exports = {
  formatUser,
  formatExperience,
  formatComment,
  formatApp,
  formatSalary,
  formatCampus,
  formatAgency,
  formatAgencyReview
};
