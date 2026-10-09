'use strict';
window.createAIExpert = function ({request, offerSave}) {
  const $ = id => document.getElementById(id);
  let epoch = 0, conversation = null, detail = null, timer = null, loading = false, sending = false, nextList = null, requestedApplication = null, refreshVersion = 0, sendVersion = 0;
  const live = generation => generation === epoch;
  function controls() {
    $('ai-form').querySelector('button').disabled = loading || sending || !conversation || !!detail?.turns.some(t => t.status === 'pending');
    $('ai-new').disabled = loading || sending;
    $('ai-history').disabled = loading || sending;
    $('ai-older').disabled = loading || !detail?.nextBefore;
  }
  function bubble(text, role) { const el = document.createElement('div'); el.className = `ai-bubble ${role}`; el.textContent = text; $('ai-messages').appendChild(el); }
  function render() {
    const target = $('ai-messages'); target.replaceChildren();
    $('ai-context').textContent = `当前上下文：${detail.context.label}；参考：${detail.context.sources.join('、') || '本次提问'}`;
    if (!detail.turns.length) bubble('你好，可以在这里继续讨论求职问题。回答会保存在当前会话中。','assistant');
    for (const turn of detail.turns) {
      bubble(turn.question,'user');
      if (turn.status === 'completed') {
        bubble(turn.answer,'assistant');
        offerSave(turn.answer, {
          id:conversation.applicationId,
          company:detail.context.company,
          jobTitle:detail.context.jobTitle
        }, window.AISaveModel.actionId(conversation.id, turn.id));
      }
      else {
        bubble(turn.status === 'pending' ? '正在思考…' : turn.status === 'cancelled' ? '这次回答已停止。' : '这次回答未完成，可重试。','assistant');
        const button = document.createElement('button'); button.type = 'button'; button.className = 'link-button';
        button.textContent = turn.status === 'pending' ? '停止回答' : '重新提问';
        button.dataset.aiTurn = turn.id;
        const current = epoch, id = conversation.id;
        button.onclick = async () => {
          if (!live(current)) return;
          if (turn.status !== 'pending') { $('ai-input').value = turn.question; $('ai-input').focus(); return; }
          button.disabled = true;
          try {
            await request(`/api/ai/conversations/${id}/turns/${turn.id}/cancel`,{method:'POST',body:'{}'});
            if(!live(current))return;
            sendVersion++; sending=false;
            await refresh(current);
          }
          catch (err) { if (live(current)) { $('ai-message').textContent = err.message; button.disabled = false; } }
        };
        target.appendChild(button);
      }
    }
    controls(); target.scrollTop = target.scrollHeight;
  }
  async function refresh(generation) {
    if (!live(generation) || !conversation) return;
    clearTimeout(timer);
    const revision = ++refreshVersion;
    const id = conversation.id;
    const data = await request(`/api/ai/conversations/${id}`);
    if (!live(generation) || conversation?.id !== id || revision !== refreshVersion) return;
    detail = data; render();
    if (data.turns.some(t => t.status === 'pending')) timer = setTimeout(() => refresh(generation).catch(err => { if(live(generation)) $('ai-message').textContent = `${err.message}，请点击刷新会话`; }),1500);
  }
  async function history(generation, append = false) {
    const scope = conversation.applicationId ? `scope=application&applicationId=${encodeURIComponent(conversation.applicationId)}` : 'scope=general';
    const data = await request(`/api/ai/conversations?${scope}${append && nextList ? `&before=${nextList}` : ''}`);
    if (!live(generation)) return;
    const select = $('ai-history'); if (!append) select.replaceChildren();
    for (const item of data.list) { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.title} · ${item.createdAt} · #${item.id}`; select.appendChild(option); }
    select.value = String(conversation.id); nextList = data.nextBefore; $('ai-more-sessions').hidden = !nextList;
  }
  async function open(applicationId, newSession = false) {
    requestedApplication = applicationId || null;
    const generation = ++epoch; clearTimeout(timer); conversation = null; detail = null; sending = false; loading = true;
    $('ai-drawer').classList.remove('hidden'); $('ai-drawer').setAttribute('aria-hidden','false');
    $('ai-input').value = ''; $('ai-message').textContent = ''; $('ai-history').replaceChildren(); $('ai-context').textContent = '正在读取会话…';
    $('ai-messages').replaceChildren(); bubble('正在读取会话…','assistant'); controls();
    try {
      const data = await request('/api/ai/conversations',{method:'POST',body:JSON.stringify(applicationId
        ? {scope:'application',applicationId:Number(applicationId),resume:!newSession}
        : {scope:'general',resume:!newSession})});
      if (!live(generation)) return;
      conversation = data;
      await refresh(generation); await history(generation);
    } catch (err) { if (live(generation)) { $('ai-message').textContent = err.message; $('ai-messages').replaceChildren(); } }
    finally { if (live(generation)) { loading = false; controls(); } }
  }
  async function send(content) {
    if (!conversation || loading || sending || detail?.turns.some(t => t.status === 'pending')) return;
    const generation = epoch, id = conversation.id, attempt = ++sendVersion;
    sending = true; controls(); $('ai-message').textContent = '';
    const requestId = crypto.randomUUID();
    // Start polling after the server has accepted the turn, so cancellation is available while generation runs.
    timer = setTimeout(() => refresh(generation).catch(() => {}),400);
    try {
      await request(`/api/ai/conversations/${id}/turns`,{method:'POST',body:JSON.stringify({content,requestId,source:'web'})});
      if (!live(generation) || attempt !== sendVersion) return;
      if ($('ai-input').value.trim() === content) $('ai-input').value = '';
    } catch (err) { if(live(generation) && attempt === sendVersion) $('ai-message').textContent = `${err.message}。请先核对会话记录，再决定是否重试。`; }
    finally {
      if(live(generation) && attempt === sendVersion) {
        sending = false;
        try { await refresh(generation); } catch(err) { if(live(generation)) $('ai-message').textContent = err.message; }
        if(live(generation)) controls();
      }
    }
  }
  function reset() { epoch++; clearTimeout(timer); conversation=null; detail=null; loading=false; sending=false; $('ai-messages').replaceChildren(); $('ai-context').textContent=''; $('ai-history').replaceChildren(); $('ai-input').value=''; $('ai-message').textContent=''; }
  $('ai-form').onsubmit = event => { event.preventDefault(); const content = $('ai-input').value.trim(); if(content) send(content); };
  $('ai-refresh').onclick = () => { const generation=epoch; if(conversation) refresh(generation).catch(err => {if(live(generation)) $('ai-message').textContent=err.message;}); else open(requestedApplication); };
  $('ai-new').onclick = () => open(conversation?.applicationId,true);
  $('ai-more-sessions').onclick = () => { const generation=epoch; history(generation,true).catch(err=>{if(live(generation)) $('ai-message').textContent=err.message;}); };
  $('ai-history').onchange = async () => {
    const id = Number($('ai-history').value), generation = ++epoch; clearTimeout(timer); loading = true; controls();
    try {
      const data = await request(`/api/ai/conversations/${id}`);
      if(!live(generation)) return;
      conversation=data.conversation; detail=data; render(); await refresh(generation);
    } catch(err) { if(live(generation)) $('ai-message').textContent=err.message; }
    finally { if(live(generation)) {loading=false;controls();} }
  };
  $('ai-older').onclick = async () => {
    if(!detail?.nextBefore || loading) return;
    const generation=epoch; loading=true; controls();
    try {
      const older=await request(`/api/ai/conversations/${conversation.id}?before=${detail.nextBefore}`);
      if(!live(generation)) return;
      detail={...detail,turns:[...older.turns,...detail.turns],nextBefore:older.nextBefore}; render();
    } catch(err) { if(live(generation)) $('ai-message').textContent=err.message; }
    finally { if(live(generation)) {loading=false;controls();} }
  };
  return {open,reset};
};
