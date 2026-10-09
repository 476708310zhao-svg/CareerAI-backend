'use strict';
(function expose(root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (root) root.AISaveModel = model;
})(typeof window === 'object' ? window : globalThis, function createModel() {
  function normalizeId(value) {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  function actionId(conversationId, turnId) {
    const conversation = normalizeId(conversationId), turn = normalizeId(turnId);
    if (!conversation || !turn) throw new Error('AI confirmation identity is invalid');
    return `ai-save:${conversation}:${turn}`;
  }

  function applicationSelection(applications, preferredId) {
    const seen = new Set();
    const owned = [];
    for (const application of (Array.isArray(applications) ? applications : [])) {
      const id = normalizeId(application?.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      owned.push({ ...application, id });
    }
    const preferred = normalizeId(preferredId);
    const selected = preferred ? owned.find(application => application.id === preferred) || null : null;
    return { applications: owned, selected, selectedId: selected?.id || null, canConfirm: Boolean(selected) };
  }

  function nextOpenVersion(current) {
    const version = Number(current);
    if (!Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) {
      throw new Error('AI confirmation open version is invalid');
    }
    return version + 1;
  }

  function isCurrentOpen(expected, current) {
    return Number.isSafeInteger(expected) && expected > 0 && expected === current;
  }

  function confirmation(target, content, dueAt) {
    if (!['note', 'task'].includes(target)) throw new Error('AI confirmation target is invalid');
    const task = target === 'task';
    const value = String(content || '').trim() || '待填写';
    return task ? {
      actionName: '新增下一步任务',
      before: '保留现有任务列表',
      after: `新增 1 项任务：${value}${dueAt ? `（日期：${dueAt}）` : '（未设置日期）'}`,
      impact: '仅新增这条申请的任务；不会自动同步到 Today 或申请时间线，也不会投递职位、发送消息或联系雇主。',
      submitLabel: '确认新增任务',
      maxLength: 200,
      dateEnabled: true,
    } : {
      actionName: '新增申请备注',
      before: '保留现有申请备注',
      after: `在备注末尾新增：${value}`,
      impact: '仅追加这条申请的备注；不会投递职位、发送消息或联系雇主。',
      submitLabel: '确认新增备注',
      maxLength: 2000,
      dateEnabled: false,
    };
  }

  return { actionId, applicationSelection, nextOpenVersion, isCurrentOpen, confirmation };
});
