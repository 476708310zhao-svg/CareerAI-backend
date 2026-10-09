(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ApplicationModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const columns = [['interested','已收藏'],['preparing','准备中'],['applied','已投递'],['oa','笔试中'],['interview','面试中'],['offer','Offer'],['closed','已结束']];
  function group(status) {
    if (['phone_screen','interview_1','interview_2','final'].includes(status)) return 'interview';
    if (['rejected','withdrawn'].includes(status)) return 'closed';
    return status;
  }
  function rows(board) {
    return [...new Map(Object.values(board.groups || {}).flat().map(row => [row.id, row])).values()];
  }
  function timestamp(value) {
    const date = String(value || '').trim();
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date) ? date.replace(' ', 'T') + 'Z' : date;
    return Date.parse(normalized) || 0;
  }
  function filterAndSort(items, { keyword = '', status = '', sort = 'deadline' } = {}) {
    const needle = keyword.trim().toLocaleLowerCase();
    return items.filter(item => (!status || item.status === status) && (!needle || `${item.company} ${item.jobTitle} ${item.city || ''}`.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => {
        let result;
        if (sort === 'company') result = String(a.company || '').localeCompare(String(b.company || ''), 'zh-CN');
        else if (sort === 'updated') result = timestamp(b.updatedAt) - timestamp(a.updatedAt);
        else result = (timestamp(a.deadline) || Infinity) - (timestamp(b.deadline) || Infinity);
        return (Number.isNaN(result) ? 0 : result) || b.id - a.id;
      });
  }
  function commonTargets(selected, statuses) {
    if (!selected.length) return [];
    return statuses.filter(({ value }) => selected.every(item => item.status === value || (item.allowedTransitions || []).some(option => option.value === value)) && selected.some(item => item.status !== value));
  }
  function snapshot(selected) { return selected.map(({ id, status, historyId }) => ({ id, status, historyId })); }
  return { columns, group, rows, filterAndSort, commonTargets, snapshot };
});
