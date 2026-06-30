const MATERIAL_KEY = 'applicationMaterials';
const apiClient = require('./api-client.js');

const QUESTION_TYPES = [
  { code: 'why_company', label: 'Why this company?' },
  { code: 'why_role', label: 'Why this role?' },
  { code: 'tell_me', label: 'Tell me about yourself' },
  { code: 'project', label: 'Describe a challenging project' },
  { code: 'leadership', label: 'Leadership experience' },
  { code: 'conflict', label: 'Conflict experience' },
  { code: 'strength', label: 'Strengths / weaknesses' },
  { code: 'career_goal', label: 'Career goals' },
  { code: 'work_auth', label: 'Work authorization question' },
  { code: 'relocation', label: 'Relocation question' }
];

function readMaterials() {
  try {
    const list = wx.getStorageSync(MATERIAL_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function hasToken() {
  try {
    return !!wx.getStorageSync('token');
  } catch (e) {
    return false;
  }
}

function normalizeRemoteMaterial(item) {
  return {
    id: item.clientId || item.id || ('material_' + Date.now()),
    serverId: item.id || '',
    questionType: item.questionType || '',
    questionLabel: item.questionLabel || '',
    jobId: item.jobId || '',
    company: item.company || '',
    jobTitle: item.jobTitle || '',
    content: item.content || '',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || ''
  };
}

function writeMaterials(list) {
  try {
    wx.setStorageSync(MATERIAL_KEY, list || []);
  } catch (e) {}
}

function summarizeResume(resume) {
  const r = resume || {};
  const b = r.basicInfo || {};
  const firstProject = (r.projects || [])[0] || {};
  const firstWork = (r.workExp || [])[0] || {};
  return {
    name: b.name || '我',
    title: b.title || '目标岗位候选人',
    skills: (r.skills || []).slice(0, 5).join('、'),
    project: firstProject.name || firstWork.company || '一个核心项目',
    projectDesc: firstProject.desc || firstWork.desc || ''
  };
}

function generateDraft({ job, questionType, resume }) {
  const type = QUESTION_TYPES.find(item => item.code === questionType) || QUESTION_TYPES[0];
  const j = job || {};
  const rs = summarizeResume(resume || {});
  const company = j.company || '贵公司';
  const role = j.jobTitle || j.title || '该岗位';
  const skills = rs.skills || '数据分析、沟通协作和快速学习';
  const projectLine = rs.projectDesc
    ? `我在「${rs.project}」中积累了相关经验：${String(rs.projectDesc).slice(0, 120)}。`
    : `我过往在「${rs.project}」中锻炼了问题拆解、执行和复盘能力。`;

  const templates = {
    why_company: `我关注 ${company}，是因为它在业务规模、产品影响力和技术实践上都与我的长期发展方向高度一致。结合我在 ${skills} 方面的积累，我希望在真实业务场景中解决复杂问题，并持续学习成熟团队的工作方法。`,
    why_role: `${role} 与我的经历匹配度较高。${projectLine} 这个岗位需要的分析、执行和协作能力，正是我希望进一步发挥和强化的方向。`,
    tell_me: `您好，我是${rs.name}，目前目标方向是${rs.title}。我具备 ${skills} 相关能力，过去通过项目和实习积累了从问题定义、方案执行到结果复盘的经验。`,
    project: `我想分享「${rs.project}」。当时的挑战是目标不清晰且资源有限，我先拆解关键指标，再推动方案落地。${projectLine} 最终我沉淀了可复用的方法，也提升了跨团队沟通能力。`,
    leadership: `我理解领导力并不只来自职位，而是能在不确定情况下推动共识和结果。在「${rs.project}」中，我主动拆解任务、同步风险，并带动成员按优先级推进。`,
    conflict: `遇到分歧时，我会先确认共同目标，再把争议拆成事实、假设和取舍。在项目中我曾通过数据和用户反馈对齐方案，避免讨论停留在主观偏好。`,
    strength: `我的优势是学习速度快、结构化拆解问题，并能把技术或业务判断落到具体行动。需要继续提升的是在高压情况下更早同步风险和寻求反馈。`,
    career_goal: `我的短期目标是在 ${role} 方向快速成长，建立扎实的业务理解和执行能力。长期希望成为能连接用户、数据和产品/技术方案的复合型人才。`,
    work_auth: `我会根据公司要求如实提供工作授权信息，并积极配合相关流程。如果岗位需要额外材料或时间安排，我可以提前准备并保持沟通。`,
    relocation: `我对地点安排保持开放，愿意根据团队和岗位需求评估 relocation。我的优先级是加入合适的团队并承担有成长性的工作。`
  };

  return {
    id: 'material_' + Date.now(),
    questionType: type.code,
    questionLabel: type.label,
    jobId: j.sourceJobId || j.id || '',
    company,
    jobTitle: role,
    content: templates[type.code] || templates.why_role,
    createdAt: new Date().toISOString()
  };
}

function saveMaterial(material) {
  const list = readMaterials();
  const next = [material].concat(list).slice(0, 80);
  writeMaterials(next);
  syncMaterial(material).catch(() => {});
  return material;
}

function updateMaterial(id, patch) {
  const list = readMaterials();
  const next = list.map(item => {
    if (String(item.id) !== String(id)) return item;
    return Object.assign({}, item, patch || {}, { updatedAt: new Date().toISOString() });
  });
  writeMaterials(next);
  const saved = next.find(item => String(item.id) === String(id)) || null;
  if (saved) syncMaterial(saved).catch(() => {});
  return saved;
}

function removeMaterial(id) {
  const list = readMaterials();
  writeMaterials(list.filter(item => String(item.id) !== String(id)));
  deleteRemoteMaterial(id).catch(() => {});
}

function getStats() {
  const list = readMaterials();
  const byType = {};
  list.forEach(item => {
    const type = item.questionType || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  });
  return {
    total: list.length,
    byType,
    companyCount: Array.from(new Set(list.map(item => item.company).filter(Boolean))).length
  };
}

function fetchRemoteMaterials() {
  if (!hasToken()) return Promise.resolve(readMaterials());
  return apiClient.request({
    path: '/api/career-assets/application-materials',
    noCache: true,
    timeout: 12000
  }).then(res => {
    if (!res || res.code !== 0 || !Array.isArray(res.data)) return readMaterials();
    const remote = res.data.map(normalizeRemoteMaterial);
    writeMaterials(remote);
    return remote;
  }).catch(() => readMaterials());
}

function syncMaterial(material) {
  if (!hasToken() || !material || !material.content) return Promise.resolve(material);
  return apiClient.post({
    path: '/api/career-assets/application-materials',
    body: material,
    timeout: 15000
  }).then(res => {
    if (res && res.code === 0 && res.data) return normalizeRemoteMaterial(res.data);
    return material;
  });
}

function deleteRemoteMaterial(id) {
  if (!hasToken() || !id) return Promise.resolve();
  return apiClient._write({
    method: 'DELETE',
    path: '/api/career-assets/application-materials/' + encodeURIComponent(id),
    timeout: 15000
  }).catch(() => {});
}

module.exports = {
  QUESTION_TYPES,
  generateDraft,
  saveMaterial,
  updateMaterial,
  removeMaterial,
  readMaterials,
  getStats,
  fetchRemoteMaterials,
  syncMaterial
};
