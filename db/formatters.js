// backend/db/formatters.js
// 统一的数据行格式化函数，供各路由文件 require 使用
// 消除各路由中重复的 format/fmt/formatXxx 函数

const { j, ja } = require('./utils');
const { buildUserProfile } = require('../utils/userProfileStandard');

// ── 用户 ─────────────────────────────────────────────────────────────────────
function formatUser(row) {
  if (!row) return null;
  const profile = buildUserProfile(row);
  return {
    id: row.id, openid: row.openid,
    nickname: row.nickname, avatar: row.avatar,
    email: row.email, phone: row.phone,
    education: profile.education,
    jobPreference: profile.jobPreference,
    profile,
    profileCompleteness: profile.completeness,
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
    progressStatus: a.progress_status || a.status,
    clientId: a.client_id || '',
    sourceJobId: a.source_job_id || '',
    company: a.company || '',
    jobTitle: a.job_title || '',
    city: a.city || '',
    salary: a.salary || '',
    jobLink: a.job_link || '',
    deadline: a.deadline || '',
    interviewTime: a.interview_time || '',
    notes: a.notes || '',
    resumeVersionId: a.resume_version_id || '',
    appliedAt: a.applied_at, viewedAt: a.viewed_at,
    updatedAt: a.updated_at || ''
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
function campusSearchText(s) {
  return [
    s.company,
    s.industry,
    s.recruit_type,
    s.position_name,
    s.position_type,
    s.region,
    s.notes,
    s.source
  ].filter(Boolean).join(' ');
}

function hasAny(text, keywords) {
  const value = String(text || '').toLowerCase();
  return keywords.some(item => value.includes(String(item).toLowerCase()));
}

function inferEducationLevel(s) {
  const explicit = String(s.education_level || '').trim();
  const text = campusSearchText(s);
  if (explicit) return explicit;
  if (hasAny(text, ['博士', 'phd', 'research scientist', 'quant research', '科研'])) return '博士/科研';
  if (hasAny(text, ['硕士', 'master', '研究生', '算法', 'ai', 'ml', 'machine learning', 'quant', '投研'])) return '硕士友好';
  return '本科及以上';
}

function educationTagsFor(level) {
  if (level === '博士/科研') return ['博士/科研', '硕士友好', '本科及以上'];
  if (level === '硕士友好') return ['硕士友好', '本科及以上'];
  return ['本科及以上'];
}

function inferOverseasFriendly(s) {
  if (s.overseas_friendly === 0 || s.overseas_friendly === 1) return s.overseas_friendly === 1;
  const region = String(s.region || '');
  const text = campusSearchText(s);
  if (region && region !== '中国内地') return true;
  return hasAny(text, ['留学生', '海外', 'international', 'global', 'opt', 'h1b', 'h-1b', 'visa', 'sponsor', '海外hc']);
}

function inferVisaStatus(s) {
  const explicit = String(s.visa_status || '').trim();
  if (explicit) return explicit;
  const text = campusSearchText(s);
  const region = String(s.region || '');
  if (hasAny(text, ['不支持 sponsor', 'no sponsor', 'without sponsorship', 'cannot sponsor'])) return '需核实';
  if (hasAny(text, ['sponsor', 'h1b', 'h-1b', 'opt友好', 'cpt', 'visa support', '签证支持'])) return 'Sponsor友好';
  if (region && region !== '中国内地') return '需核实签证';
  return '国内岗位';
}

function visaStatusKey(label) {
  if (label === 'Sponsor友好') return 'support';
  if (label === '需核实' || label === '需核实签证') return 'verify';
  if (label === '国内岗位') return 'domestic';
  return 'info';
}

function parseDateOnly(value) {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function todayShanghai() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).reduce((acc, item) => {
    acc[item.type] = item.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function deadlineMeta(deadlineDate) {
  const raw = String(deadlineDate || '').trim();
  if (!raw || raw === '尽快投递') {
    return { deadlineDays: null, deadlineStatus: '尽快投递', deadlineWindow: 'urgent' };
  }
  const dateText = parseDateOnly(raw);
  if (!dateText) return { deadlineDays: null, deadlineStatus: raw, deadlineWindow: 'unknown' };
  const target = new Date(dateText + 'T00:00:00+08:00').getTime();
  const today = new Date(todayShanghai() + 'T00:00:00+08:00').getTime();
  const days = Math.round((target - today) / 86400000);
  if (days < 0) return { deadlineDays: days, deadlineStatus: '已截止', deadlineWindow: 'expired' };
  if (days === 0) return { deadlineDays: days, deadlineStatus: '今日截止', deadlineWindow: '7d' };
  if (days <= 7) return { deadlineDays: days, deadlineStatus: `${days}天内截止`, deadlineWindow: '7d' };
  if (days <= 30) return { deadlineDays: days, deadlineStatus: '30天内截止', deadlineWindow: '30d' };
  return { deadlineDays: days, deadlineStatus: '可持续关注', deadlineWindow: 'later' };
}

function formatCampus(s) {
  const educationLevel = inferEducationLevel(s);
  const visaTag = inferVisaStatus(s);
  const deadline = deadlineMeta(s.deadline_date);
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
    source:       s.source || '',
    isVerified:   s.is_verified === 1,
    viewCount:    s.view_count,
    createdAt:    s.created_at,
    educationLevel,
    educationTags: educationTagsFor(educationLevel),
    overseasFriendly: inferOverseasFriendly(s),
    overseasLabel: inferOverseasFriendly(s) ? '留学生友好' : '普通校招',
    visaTag,
    visaStatus: visaStatusKey(visaTag),
    deadlineDays: deadline.deadlineDays,
    deadlineStatus: deadline.deadlineStatus,
    deadlineWindow: deadline.deadlineWindow
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
