(() => {
  'use strict';

  const PREFIX = '/api/v4/question-practice';
  const TABS = [
    ['catalog', '题集'], ['history', '练习记录'], ['mistakes', '错题'], ['favorites', '收藏']
  ];
  const unavailableCodes = new Set([
    'SET_USE_DENIED', 'SOURCE_USE_DENIED', 'QUESTION_RIGHTS_DENIED',
    'QUESTION_UNAVAILABLE', 'SET_UNAVAILABLE', 'RIGHTS_DENIED', 'SESSION_UNAVAILABLE', 'SESSION_NOT_FOUND'
  ]);

  function element(tag, className, content) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (content !== undefined) item.textContent = String(content);
    return item;
  }
  function action(label, handler, className = 'mini-button') {
    const item = element('button', className, label);
    item.type = 'button';
    item.addEventListener('click', handler);
    return item;
  }
  function asId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }
  function answerLabel(value) {
    if (value === null || value === undefined) return '未答';
    if (typeof value === 'boolean') return value ? '正确' : '错误';
    if (Array.isArray(value)) return value.join('、') || '未答';
    return String(value);
  }

  window.createQuestionPractice = function ({ request, getIdentity, toast }) {
    const root = document.getElementById('practice-view');
    let epoch = 0;
    let scene = 'catalog';
    let catalog = [];
    let activeSessions = [];
    let catalogNextCursor = null;
    let activeNextCursor = null;
    let entries = [];
    let nextCursor = null;
    let loadingMore = false;
    let session = null;
    let items = [];
    let position = null;
    let question = null;
    let submission = null;
    let answer = null;
    let pendingStart = null;
    let pendingSubmission = null;
    let message = '';

    const identity = () => getIdentity() || null;
    const current = (generation, owner, selectedSession = null, selectedPosition = null) =>
      generation === epoch && owner === identity() &&
      (selectedSession === null || selectedSession === session?.id) &&
      (selectedPosition === null || selectedPosition === position);
    const mark = () => ({ generation: epoch, owner: identity() });
    const valid = (stamp, sid = null, pos = null) => current(stamp.generation, stamp.owner, sid, pos);

    function reset() {
      epoch += 1;
      scene = 'catalog'; catalog = []; activeSessions = []; catalogNextCursor = null;
      activeNextCursor = null; entries = []; nextCursor = null; loadingMore = false;
      session = null; items = []; position = null; question = null; submission = null;
      answer = null; pendingStart = null; pendingSubmission = null; message = '';
      root.replaceChildren();
    }

    function addResourceEntry() {
      const grid = document.querySelector('#resources-view .resource-grid');
      if (!grid || grid.querySelector('[data-practice-entry]')) return;
      const card = element('article', 'card resource-card');
      card.dataset.practiceEntry = '1';
      card.append(element('h3', '', '在线刷题'));
      card.append(element('p', '', '练习已授权的免费题集，提交后查看判分与解析。'));
      const link = action('打开在线刷题 →', () => document.querySelector('[data-view="practice"]')?.click(), 'link-button');
      card.append(link); grid.prepend(card);
    }

    function shell(title, description, selectedTab = null) {
      root.replaceChildren();
      const header = element('div', 'practice-head');
      const heading = element('div');
      heading.append(element('p', 'eyebrow', 'QUESTION PRACTICE'));
      const h = element('h3', '', title); h.tabIndex = -1; heading.append(h);
      if (description) heading.append(element('p', 'muted', description));
      header.append(heading);
      root.append(header);
      const tabs = element('nav', 'practice-tabs'); tabs.setAttribute('aria-label', '刷题页面');
      for (const [key, label] of TABS) {
        const tab = action(label, () => showTab(key), key === selectedTab ? 'practice-tab active' : 'practice-tab');
        if (key === selectedTab) tab.setAttribute('aria-current', 'page');
        tabs.append(tab);
      }
      root.append(tabs);
      if (message) { const notice = element('p', 'practice-message', message); notice.setAttribute('role', 'alert'); root.append(notice); }
      const body = element('div', 'practice-body'); root.append(body);
      return body;
    }

    function loading(label, tab = scene) {
      const body = shell(label, '正在从服务器读取本账号的练习进度。', TABS.some(([key]) => key === tab) ? tab : null);
      const status = element('p', 'muted', '正在加载…'); status.setAttribute('role', 'status'); body.append(status);
    }

    function showUnavailable() {
      epoch += 1;
      question = null; submission = null; answer = null; pendingSubmission = null;
      scene = 'unavailable'; message = '';
      const body = shell('当前题目不可用', '这道题或题集的展示授权发生变化。已保存的作答进度仍在你的账号中，授权恢复后可继续。');
      if (session?.total) body.append(element('p', 'practice-progress-text', `已答 ${Number(session.answered) || 0} / ${Number(session.total) || 0} 题`));
      body.append(element('p', 'card practice-notice', '为保护题目来源，当前不展示题干、答案和解析。'));
      body.append(action('返回题集', () => showTab('catalog'), 'primary-button'));
    }

    function showSessionEnded() {
      epoch += 1;
      question = null; submission = null; answer = null; pendingSubmission = null;
      scene = 'session-ended'; message = '';
      const body = shell('练习已结束', '这次练习已在其他页面结束。此前正式提交的进度仍保存在账号内。');
      body.append(action('查看练习记录', () => showTab('history'), 'primary-button'));
    }

    function isUnavailable(error) {
      return error?.status === 403 || unavailableCodes.has(error?.code);
    }

    async function showTab(tab) {
      epoch += 1;
      scene = tab; session = null; items = []; position = null; question = null; submission = null;
      answer = null; pendingSubmission = null; entries = []; nextCursor = null; loadingMore = false; message = '';
      loading(tab === 'catalog' ? '免费题集' : TABS.find(([key]) => key === tab)?.[1] || '在线刷题', tab);
      const stamp = mark();
      try {
        if (tab === 'catalog') {
          const [sets, sessions] = await Promise.all([
            request(`${PREFIX}/sets?cursor=0&limit=30`),
            request(`${PREFIX}/sessions?cursor=0&limit=30&status=active`)
          ]);
          if (!valid(stamp)) return;
          catalog = Array.isArray(sets.sets) ? sets.sets : [];
          activeSessions = Array.isArray(sessions.sessions) ? sessions.sessions : [];
          catalogNextCursor = sets.nextCursor ?? null;
          activeNextCursor = sessions.nextCursor ?? null;
          renderCatalog();
        } else {
          const path = tab === 'history' ? `${PREFIX}/sessions?cursor=0&limit=30&status=finished` :
            `${PREFIX}/${tab}?cursor=0&limit=30`;
          const data = await request(path);
          if (!valid(stamp)) return;
          entries = Array.isArray(data[tab === 'history' ? 'sessions' : tab]) ? data[tab === 'history' ? 'sessions' : tab] : [];
          nextCursor = data.nextCursor ?? null;
          renderList();
        }
      } catch (error) {
        if (!valid(stamp)) return;
        message = error.message || '读取失败，请重试。';
        const body = shell('暂时无法读取练习', '', tab);
        body.append(action('重试', () => showTab(tab), 'primary-button'));
      }
    }

    function setCard(set) {
      const card = element('article', 'card practice-card');
      card.append(element('h4', '', set.title || '未命名题集'));
      card.append(element('p', 'muted', `${Number(set.questionCount) || 0} 题 · 免费练习`));
      const retry = pendingStart?.setId === set.id;
      const button = action(retry ? '重试开始' : '开始练习', () => startSession(set.id), 'primary-button');
      button.disabled = Boolean(retry && pendingStart.inFlight);
      card.append(button);
      return card;
    }

    function sessionCard(row) {
      const card = element('article', 'card practice-card');
      card.append(element('h4', '', row.setTitle || '练习记录'));
      card.append(element('p', 'muted', `已答 ${Number(row.answered) || 0} / ${Number(row.total) || 0} 题`));
      if (row.status === 'finished') card.append(element('p', 'practice-meta', `答对 ${Number(row.correctCount) || 0} 题`));
      card.append(action(row.status === 'active' ? '继续练习' : '查看记录', () => openSession(row.id), 'mini-button primary'));
      return card;
    }

    function renderCatalog() {
      const body = shell('免费题集', '按题目顺序练习；正式提交后才能查看判分和解析。', 'catalog');
      if (activeSessions.length) {
        body.append(element('h4', 'practice-section-title', '继续上次练习'));
        const rows = element('div', 'practice-grid');
        activeSessions.forEach(row => rows.append(sessionCard(row)));
        body.append(rows);
        if (activeNextCursor !== null) body.append(action(loadingMore ? '加载中…' : '更多进行中的练习', () => loadMoreCatalog('active')));
      }
      body.append(element('h4', 'practice-section-title', '可练题集'));
      if (!catalog.length) {
        body.append(element('p', 'card practice-empty', '目前暂无已开放且已授权的公开题集。通过审核并明确开放后，题集会显示在这里。'));
      } else {
        const rows = element('div', 'practice-grid'); catalog.forEach(set => rows.append(setCard(set))); body.append(rows);
        if (catalogNextCursor !== null) body.append(action(loadingMore ? '加载中…' : '更多题集', () => loadMoreCatalog('sets')));
      }
    }

    async function loadMoreCatalog(kind) {
      if (scene !== 'catalog' || loadingMore) return;
      const cursor = kind === 'sets' ? catalogNextCursor : activeNextCursor;
      if (cursor === null) return;
      loadingMore = true; renderCatalog();
      const stamp = mark();
      const path = kind === 'sets' ? `${PREFIX}/sets?cursor=${encodeURIComponent(cursor)}&limit=30` :
        `${PREFIX}/sessions?cursor=${encodeURIComponent(cursor)}&limit=30&status=active`;
      try {
        const data = await request(path);
        if (!valid(stamp) || scene !== 'catalog') return;
        if (kind === 'sets') {
          catalog.push(...(Array.isArray(data.sets) ? data.sets : []));
          catalogNextCursor = data.nextCursor ?? null;
        } else {
          activeSessions.push(...(Array.isArray(data.sessions) ? data.sessions : []));
          activeNextCursor = data.nextCursor ?? null;
        }
      } catch (error) {
        if (!valid(stamp) || scene !== 'catalog') return;
        message = error.message || '加载失败，可重试。';
      } finally {
        if (valid(stamp) && scene === 'catalog') { loadingMore = false; renderCatalog(); }
      }
    }

    async function startSession(rawSetId) {
      const setId = asId(rawSetId); if (!setId) return;
      if (!pendingStart || pendingStart.setId !== setId) pendingStart = { setId, clientKey: crypto.randomUUID() };
      if (pendingStart.inFlight) return;
      const pending = pendingStart;
      pending.inFlight = true;
      message = ''; renderCatalog();
      const stamp = mark();
      try {
        const data = await request(`${PREFIX}/sets/${setId}/sessions`, {
          method: 'POST', body: JSON.stringify({ clientKey: pending.clientKey })
        });
        if (!valid(stamp) || pendingStart !== pending) return;
        pendingStart = null;
        await openSession(data.session.id);
      } catch (error) {
        if (!valid(stamp) || pendingStart !== pending) return;
        pending.inFlight = false;
        message = error.message || '开始失败，重试会保留同一请求。';
        renderCatalog();
      }
    }

    async function openSession(rawId, selectedPosition = null) {
      const id = asId(rawId); if (!id) return;
      epoch += 1; scene = 'session'; session = { id }; items = []; position = null;
      question = null; submission = null; answer = null; pendingSubmission = null; message = '';
      loading('读取练习');
      const stamp = mark();
      try {
        const data = await request(`${PREFIX}/sessions/${id}`);
        if (!valid(stamp, id)) return;
        session = data.session; items = Array.isArray(data.items) ? data.items : [];
        const first = selectedPosition || (session.status === 'active' ? items.find(item => !item.answered)?.position : null);
        if (first) await openQuestion(first);
        else renderOverview();
      } catch (error) {
        if (!valid(stamp, id)) return;
        if (isUnavailable(error)) showUnavailable();
        else { message = error.message || '读取练习失败'; const body = shell('暂时无法读取练习', '', null); body.append(action('返回题集', () => showTab('catalog'))); }
      }
    }

    async function openQuestion(rawPosition) {
      const next = asId(rawPosition); if (!next || !session?.id) return;
      epoch += 1; scene = 'question'; position = next; question = null; submission = null;
      answer = null; pendingSubmission = null; message = '';
      loading('读取题目');
      const stamp = mark(), sessionId = session.id;
      try {
        const data = await request(`${PREFIX}/sessions/${sessionId}/items/${next}`);
        if (!valid(stamp, sessionId, next)) return;
        question = data.question;
        if (items.find(item => item.position === next)?.answered) {
          const result = await request(`${PREFIX}/sessions/${sessionId}/items/${next}/result`);
          if (!valid(stamp, sessionId, next)) return;
          submission = result.submission;
        }
        renderQuestion();
      } catch (error) {
        if (!valid(stamp, sessionId, next)) return;
        if (isUnavailable(error)) showUnavailable();
        else { question = null; message = error.message || '读取题目失败'; const body = shell('暂时无法读取题目', '', null); body.append(action('重试', () => openQuestion(next), 'primary-button')); }
      }
    }

    function renderOverview() {
      scene = 'overview';
      const body = shell(session?.setTitle || '练习进度', '每道题的正式提交由服务器判分，已答题可重新查看结果。');
      const progress = element('p', 'practice-progress-text', `已答 ${Number(session?.answered) || 0} / ${Number(session?.total) || items.length} 题`);
      body.append(progress);
      const list = element('div', 'practice-steps');
      for (const item of items) {
        const row = element('div', 'practice-step');
        row.append(element('span', '', `第 ${item.position} 题 · ${item.answered ? (item.isCorrect ? '答对' : '已提交') : '未答'}`));
        const next = items.find(candidate => !candidate.answered)?.position;
        if (item.answered || (session.status === 'active' && item.position === next)) {
          row.append(action(item.answered ? '查看结果' : '继续本题', () => openQuestion(item.position)));
        } else row.append(element('span', 'muted', session.status === 'finished' ? '未提交' : '按顺序完成前面的题后解锁'));
        list.append(row);
      }
      body.append(list);
      const actions = element('div', 'practice-actions');
      if (session?.status === 'active') actions.append(action('结束练习', finishSession, 'primary-button'));
      actions.append(action('返回题集', () => showTab('catalog')));
      body.append(actions);
    }

    function choiceControl(value, text, kind, checked, onChange) {
      const label = element('label', 'practice-choice');
      const input = element('input'); input.type = kind; input.name = 'practice-answer';
      input.value = String(value); input.checked = Boolean(checked);
      input.disabled = Boolean(submission || pendingSubmission);
      input.addEventListener('change', onChange);
      label.append(input, element('span', '', text));
      return label;
    }

    function renderQuestion() {
      if (!question) return;
      scene = 'question';
      const body = shell(session?.setTitle || '在线刷题', '题目按会话中固定的版本和顺序展示。');
      const total = Number(session?.total) || items.length;
      const progressLabel = element('label', 'practice-progress-text', `第 ${position} / ${total} 题`);
      const progress = element('progress', 'practice-progress');
      progress.max = Math.max(total, 1); progress.value = Math.min(Number(session?.answered) || 0, total);
      progress.setAttribute('aria-label', `已完成 ${Number(session?.answered) || 0} / ${total} 题`);
      body.append(progressLabel, progress);
      const card = element('article', 'card practice-question');
      const typeLabel = question.type === 'multiple' ? '多选题' : question.type === 'boolean' ? '判断题' : '单选题';
      card.append(element('p', 'practice-type', typeLabel));
      card.append(element('h4', 'practice-stem', question.stem || '题干暂不可用'));
      if (!submission && session?.status === 'finished') {
        card.append(element('p', 'practice-hint', '这道题没有提交，练习已结束。'));
        card.append(action('查看练习进度', renderOverview));
      } else if (!submission) {
        const fieldset = element('fieldset', 'practice-options');
        fieldset.append(element('legend', '', '选择你的答案'));
        if (question.type === 'boolean') {
          for (const [value, label] of [[true, '正确'], [false, '错误']]) {
            fieldset.append(choiceControl(value, label, 'radio', answer === value, () => { answer = value; message = ''; }));
          }
        } else {
          for (const option of question.options || []) {
            const checked = Array.isArray(answer) && answer.includes(option.id);
            fieldset.append(choiceControl(option.id, `${option.id}. ${option.text}`, question.type === 'multiple' ? 'checkbox' : 'radio', checked, event => {
              if (question.type === 'multiple') {
                const values = new Set(Array.isArray(answer) ? answer : []);
                if (event.target.checked) values.add(option.id); else values.delete(option.id);
                answer = [...values].sort();
              } else answer = [option.id];
              message = '';
            }));
          }
        }
        card.append(fieldset);
        if (pendingSubmission) card.append(element('p', 'practice-hint', '上次提交的结果尚未确认。重试会使用相同请求编号和原答案。'));
        const controls = element('div', 'practice-actions');
        const send = action(pendingSubmission ? '重试同一提交' : '正式提交答案', () => submitAnswer(false), 'primary-button');
        send.disabled = Boolean(pendingSubmission?.inFlight);
        controls.append(send);
        if (!pendingSubmission) controls.append(action('未答并继续', () => submitAnswer(true)));
        card.append(controls);
      } else {
        const feedback = element('section', submission.isCorrect ? 'practice-result correct' : 'practice-result incorrect');
        feedback.setAttribute('aria-label', '本题提交结果');
        feedback.append(element('h5', '', submission.isCorrect ? '回答正确' : '本题已提交'));
        feedback.append(element('p', '', `你的作答：${answerLabel(submission.selectedAnswer)}`));
        feedback.append(element('p', '', `正确答案：${answerLabel(submission.correctAnswer)}`));
        feedback.append(element('p', 'practice-explanation', submission.explanation || '暂无解析'));
        card.append(feedback);
        const controls = element('div', 'practice-actions');
        const next = items.find(item => item.position > position && !item.answered) || items.find(item => !item.answered);
        controls.append(action(next ? '下一题' : '查看练习进度', () => next ? openQuestion(next.position) : renderOverview(), 'primary-button'));
        card.append(controls);
      }
      const meta = items.find(item => item.position === position);
      const footer = element('div', 'practice-actions practice-secondary');
      const overview = action('查看全部进度', renderOverview);
      overview.disabled = Boolean(pendingSubmission);
      footer.append(overview);
      footer.append(action(meta?.favorite ? '取消收藏' : '收藏本题', toggleFavorite));
      card.append(footer);
      body.append(card);
    }

    async function submitAnswer(unanswered) {
      if (!session?.id || !question || submission) return;
      if (!pendingSubmission) {
        let value = unanswered ? null : answer;
        if (!unanswered && (value === null || (Array.isArray(value) && value.length === 0))) {
          message = '请先选择答案，或使用“未答并继续”。'; renderQuestion(); return;
        }
        if (Array.isArray(value)) value = [...value].sort();
        pendingSubmission = { sessionId: session.id, position, requestId: crypto.randomUUID(), answer: value };
      }
      const pending = pendingSubmission;
      if (pending.inFlight) return;
      pending.inFlight = true;
      renderQuestion();
      const stamp = mark();
      const accept = result => {
        submission = result.submission;
        pendingSubmission = null;
        const item = items.find(row => row.position === position);
        if (item && !item.answered) {
          item.answered = true;
          item.isCorrect = Boolean(submission.isCorrect);
          session.answered = (Number(session.answered) || 0) + 1;
          if (submission.isCorrect) session.correctCount = (Number(session.correctCount) || 0) + 1;
        }
        message = ''; renderQuestion();
      };
      try {
        const result = await request(`${PREFIX}/sessions/${pending.sessionId}/items/${pending.position}/submit`, {
          method: 'POST', body: JSON.stringify({ requestId: pending.requestId, answer: pending.answer })
        });
        if (!valid(stamp, pending.sessionId, pending.position) || pendingSubmission !== pending) return;
        accept(result);
      } catch (error) {
        if (!valid(stamp, pending.sessionId, pending.position) || pendingSubmission !== pending) return;
        if (isUnavailable(error)) { showUnavailable(); return; }
        if (error.status === 409) {
          try {
            const result = await request(`${PREFIX}/sessions/${pending.sessionId}/items/${pending.position}/result`);
            if (!valid(stamp, pending.sessionId, pending.position) || pendingSubmission !== pending) return;
            accept(result);
            return;
          } catch (readError) {
            if (!valid(stamp, pending.sessionId, pending.position) || pendingSubmission !== pending) return;
            if (isUnavailable(readError)) { showUnavailable(); return; }
          }
        }
        if (error.code === 'SESSION_FINISHED') { showSessionEnded(); return; }
        pending.inFlight = false;
        message = error.message || '提交结果未确认，请用同一请求重试。';
        renderQuestion();
      }
    }

    async function toggleFavorite() {
      if (!session?.id || !position) return;
      const item = items.find(row => row.position === position), favorite = Boolean(item?.favorite);
      const stamp = mark(), sid = session.id, pos = position;
      try {
        const data = await request(`${PREFIX}/sessions/${sid}/items/${pos}/favorite`, { method: favorite ? 'DELETE' : 'PUT' });
        if (!valid(stamp, sid, pos)) return;
        if (item) item.favorite = Boolean(data.favorite);
        if (data.available === false) {
          showUnavailable();
          const unavailableStamp = mark();
          try {
            const detail = await request(`${PREFIX}/sessions/${sid}`);
            if (!valid(unavailableStamp, sid, pos) || scene !== 'unavailable') return;
            session = detail.session; items = Array.isArray(detail.items) ? detail.items : [];
            showUnavailable();
          } catch (_error) { /* The access notice already hides cached content. */ }
          return;
        }
        renderQuestion();
      } catch (error) {
        if (!valid(stamp, sid, pos)) return;
        if (isUnavailable(error)) showUnavailable();
        else { message = error.message || '收藏操作失败'; renderQuestion(); }
      }
    }

    async function finishSession() {
      if (!session?.id || session.status !== 'active') return;
      const sid = session.id, stamp = mark();
      message = '正在结束练习…'; renderOverview();
      try {
        const data = await request(`${PREFIX}/sessions/${sid}/finish`, { method: 'POST', body: '{}' });
        if (!valid(stamp, sid)) return;
        session = data.session; message = ''; renderOverview();
        toast('练习已结束');
      } catch (error) {
        if (!valid(stamp, sid)) return;
        if (isUnavailable(error)) showUnavailable();
        else { message = error.message || '结束失败，可重试'; renderOverview(); }
      }
    }

    function renderList() {
      const title = TABS.find(([key]) => key === scene)?.[1] || '练习记录';
      const body = shell(title, scene === 'history' ? '历史成绩由服务器保存。' : '已失去展示授权的题目仅保留记录，不显示题干或答案。', scene);
      if (!entries.length) body.append(element('p', 'card practice-empty', scene === 'history' ? '还没有已结束的练习。' : scene === 'mistakes' ? '目前没有错题。' : '目前没有收藏题目。'));
      const grid = element('div', 'practice-grid');
      for (const row of entries) {
        if (scene === 'history') { grid.append(sessionCard(row)); continue; }
        const card = element('article', 'card practice-card');
        card.append(element('h4', '', row.available && row.question?.stem ? row.question.stem : `第 ${row.position} 题`));
        card.append(element('p', 'muted', row.available ? (scene === 'mistakes' ? '错题记录' : '已收藏') : '当前展示授权不可用，题目内容已隐藏。'));
        if (row.available) card.append(action('查看题目', () => openSession(row.sessionId, row.position)));
        grid.append(card);
      }
      body.append(grid);
      if (nextCursor !== null) body.append(action('加载更多', loadMore));
    }

    async function loadMore() {
      if (nextCursor === null || loadingMore || !['history', 'mistakes', 'favorites'].includes(scene)) return;
      const tab = scene, cursor = nextCursor, stamp = mark();
      loadingMore = true;
      const path = tab === 'history' ? `${PREFIX}/sessions?cursor=${encodeURIComponent(cursor)}&limit=30&status=finished` :
        `${PREFIX}/${tab}?cursor=${encodeURIComponent(cursor)}&limit=30`;
      try {
        const data = await request(path);
        if (!valid(stamp) || scene !== tab) return;
        entries.push(...(Array.isArray(data[tab === 'history' ? 'sessions' : tab]) ? data[tab === 'history' ? 'sessions' : tab] : []));
        nextCursor = data.nextCursor ?? null; renderList();
      } catch (error) {
        if (!valid(stamp) || scene !== tab) return;
        message = error.message || '加载失败'; renderList();
      } finally {
        if (valid(stamp) && scene === tab) loadingMore = false;
      }
    }

    return { open: () => showTab('catalog'), reset, addResourceEntry };
  };
})();
