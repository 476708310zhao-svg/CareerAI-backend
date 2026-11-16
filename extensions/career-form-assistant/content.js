(() => {
  'use strict';
  const hosts = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com']);
  const adapters = {
    greenhouse: {
      email: ['input[type="email"]', 'input[name="email"]', '#email', '[data-qa="email"]'],
      phone: ['input[type="tel"]', 'input[name*="phone" i]', '#phone', '[data-qa*="phone" i]'],
      school: ['input[name*="school" i]', 'input[name*="university" i]', '[data-qa*="school" i]'],
      major: ['input[name*="major" i]', 'input[name*="field_of_study" i]'],
      degree: ['input[name*="degree" i]', '[data-qa*="degree" i]'],
      graduationYear: ['input[name*="graduat" i]', '[data-qa*="graduat" i]'],
      city: ['input[name*="city" i]', '[data-qa*="city" i]'],
      skills: ['textarea[name*="skill" i]', 'input[name*="skill" i]']
    },
    lever: {
      email: ['input[type="email"]', 'input[name="email"]', '#email', '[data-qa="email"]'],
      phone: ['input[type="tel"]', 'input[name*="phone" i]', '#phone'],
      school: ['input[name*="school" i]', 'input[name*="university" i]', 'input[name*="education" i]'],
      major: ['input[name*="major" i]', 'input[name*="field" i]'],
      degree: ['input[name*="degree" i]'],
      graduationYear: ['input[name*="graduat" i]'],
      city: ['input[name*="city" i]'],
      skills: ['textarea[name*="skill" i]', 'input[name*="skill" i]']
    },
    ashby: {
      email: ['input[type="email"]', 'input[name*="email" i]', '[autocomplete="email"]'],
      phone: ['input[type="tel"]', 'input[name*="phone" i]', '[autocomplete="tel"]'],
      school: ['input[name*="school" i]', 'input[name*="university" i]', 'input[name*="education" i]'],
      major: ['input[name*="major" i]', 'input[name*="fieldOfStudy" i]'],
      degree: ['input[name*="degree" i]'],
      graduationYear: ['input[name*="graduation" i]'],
      city: ['input[name*="city" i]', 'input[autocomplete="address-level2"]'],
      skills: ['textarea[name*="skill" i]', 'input[name*="skill" i]']
    }
  };
  if (!hosts.has(location.hostname) || !/^https:$/.test(location.protocol)) return;

  const rules = [
    ['email', /e-?mail|邮箱/i, (el) => el.type === 'email' || /email/i.test(`${el.name} ${el.id} ${el.autocomplete}`)],
    ['phone', /phone|mobile|telephone|电话|手机/i, (el) => el.type === 'tel' || /phone|mobile|tel/i.test(`${el.name} ${el.id} ${el.autocomplete}`)],
    ['school', /school|university|college|institution|学校|大学/i, (el) => /school|university|college|institution/i.test(`${el.name} ${el.id}`)],
    ['major', /major|field of study|专业/i, (el) => /major|field_of_study/i.test(`${el.name} ${el.id}`)],
    ['degree', /degree|学历|学位/i, (el) => /degree/i.test(`${el.name} ${el.id}`)],
    ['graduationYear', /graduation year|毕业年份|毕业时间/i, (el) => /graduat/i.test(`${el.name} ${el.id}`)],
    ['city', /city|城市|所在地/i, (el) => /city/i.test(`${el.name} ${el.id}`)],
    ['skills', /skills|技能/i, (el) => /skills/i.test(`${el.name} ${el.id}`)]
  ];
  const controls = new Map();
  let nextId = 0;

  function isCurrentAllowedSender(sender) {
    if (sender?.id !== chrome.runtime.id || !Number.isSafeInteger(sender?.tab?.id)
      || !/^https:$/.test(location.protocol) || !hosts.has(location.hostname)) return false;
    try {
      const senderUrl = new URL(sender.url || sender.tab.url);
      return senderUrl.protocol === 'https:' && senderUrl.hostname === location.hostname;
    } catch { return false; }
  }

  function labelFor(el) {
    const label = el.labels && el.labels[0];
    return String(label?.innerText || el.getAttribute('aria-label') || el.placeholder || el.name || el.id || '表单字段').trim().slice(0, 100);
  }

  function siteAdapter() {
    if (location.hostname === 'jobs.lever.co') return 'lever';
    if (location.hostname === 'jobs.ashbyhq.com') return 'ashby';
    return 'greenhouse';
  }

  function matchesAdapterField(el, key) {
    const selectors = adapters[siteAdapter()][key] || [];
    return selectors.some(selector => {
      try { return el.matches(selector); } catch { return false; }
    });
  }

  function candidates() {
    controls.clear();
    nextId = 0;
    const result = [];
    document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select').forEach(el => {
      if (el.disabled || el.readOnly || el.type === 'password' || el.type === 'file' || el.type === 'checkbox' || el.type === 'radio') return;
      const label = labelFor(el);
      const rule = rules.find(([key, labelPattern, attrPattern]) => matchesAdapterField(el, key)
        || labelPattern.test(label) || attrPattern(el));
      if (!rule) return;
      const id = String(++nextId);
      controls.set(id, { element: el, key: rule[0], label });
      result.push({ id, key: rule[0], label });
    });
    return result.slice(0, 30);
  }

  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (!setter) return false;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isCurrentAllowedSender(sender) || !message || typeof message !== 'object') return false;
    if (message.type === 'zhiyin:inspect') {
      const fields = candidates();
      sendResponse({ ok: true, host: location.hostname, adapter: siteAdapter(), fields,
        compatibility: fields.length ? 'candidate_fields_found' : 'no_compatible_fields' });
      return false;
    }
    if (message.type === 'zhiyin:fill') {
      if (!Array.isArray(message.items) || message.items.length > 30) {
        sendResponse({ ok: false, error: '字段选择无效' }); return false;
      }
      if (!message.host || message.host !== location.hostname) {
        sendResponse({ ok: false, error: '当前招聘网站与预览不一致，请重新识别。' }); return false;
      }
      let filled = 0;
      const filledIds = new Set();
      message.items.forEach(item => {
        if (!item || typeof item.id !== 'string' || typeof item.value !== 'string' || item.value.length > 2000) return;
        const candidate = controls.get(item.id);
        if (!candidate || candidate.key !== item.key || !item.value || !candidate.element.isConnected
          || !candidate.element.matches('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select')
          || candidate.element.disabled || candidate.element.readOnly) return;
        if (setValue(candidate.element, item.value)) { filled += 1; filledIds.add(item.id); }
      });
      sendResponse({ ok: true, filled, filledIds: [...filledIds], host: location.hostname });
      return false;
    }
    return false;
  });
})();
