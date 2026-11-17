'use strict';
if (requireAuth() && !canAccess('manualServices')) location.replace('dashboard.html');
const base = '/admin/api/v4/manual-services';
const transitions = { requested:['accepted','rejected','closed'],accepted:['in_progress','rejected','closed'],in_progress:['accepted','delivered','closed'],delivered:['closed'] };
let selected = null;
const el = id => document.getElementById(id);
function say(message, bad=false){ el('notice').textContent=message; el('notice').className=bad?'manual-error':'manual-muted'; }
function line(target, text){ const p=document.createElement('p'); p.textContent=text; target.appendChild(p); }
async function load(){
  if(!canAccess('manualServices'))return;
  const query=new URLSearchParams(); if(el('filter').value)query.set('status',el('filter').value);
  const result=await api(base+(query.size?'?'+query.toString():''));
  const box=el('requests'); box.replaceChildren();
  if(!result||result.code!==0){say('工单加载失败，请重试。',true);return;}
  const rows=result.data&&result.data.list||[];
  if(!rows.length)line(box,'暂无有效工单');
  for(const item of rows){const button=document.createElement('button');button.type='button';button.textContent=`#${item.id} ${item.serviceTitle} · ${item.status} · ${item.createdAt}`;button.onclick=()=>show(item.id);box.appendChild(button);}
}
async function show(id){
  selected=null;el('actions').hidden=true;el('detail').textContent='读取中…';el('history').replaceChildren();
  const result=await api(base+'/'+encodeURIComponent(id));
  if(!result||result.code!==0){el('detail').textContent='工单已撤销、到期或无法读取，请刷新。';await load();return;}
  const data=result.data, item=data.request; selected=item;
  const detail=el('detail');detail.replaceChildren();
  line(detail,`#${item.id} ${item.serviceTitle} · ${item.status} · 版本 ${item.version}`);
  line(detail,`授权范围：${(item.scopes||[]).join('、') || '无'}；有效至：${item.expiresAt}`);
  line(detail,`用户说明：${item.summary||'未填写'}`);
  line(detail,`申请 ID：${item.applicationId||'未选择'}；简历 ID：${item.resumeId||'未选择'}`);
  const select=el('nextStatus');select.replaceChildren();for(const value of transitions[item.status]||[]){const option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option);}
  el('actions').hidden=false;el('changeStatus').disabled=!select.options.length;
  el('deliver').disabled=!['accepted','in_progress'].includes(item.status);
  const history=el('history');for(const event of data.events||[])line(history,`${event.createdAt} · ${event.eventType} · ${event.toStatus} · ${event.note||''}`);
  for(const delivery of data.deliveries||[])line(history,`${delivery.createdAt} · 交付：${delivery.summary}`);
}
async function changeStatus(){
  if(!selected)return;const id=selected.id;
  const result=await api(`${base}/${id}/status`,{method:'PATCH',body:{expectedVersion:selected.version,status:el('nextStatus').value,note:el('note').value}});
  if(!result||result.code!==0){say('更新失败，请重新读取工单。',true);await show(id);return;}
  say('状态已更新');await show(id);await load();
}
async function deliver(){
  if(!selected)return;const id=selected.id;
  const raw=el('fileRefs').value.trim();const refs=raw?raw.split(',').map(value=>Number(value.trim())):[];
  if(refs.some(value=>!Number.isSafeInteger(value)||value<=0)){say('文件 ID 必须为正整数。',true);return;}
  const result=await api(`${base}/${id}/deliveries`,{method:'POST',body:{expectedVersion:selected.version,summary:el('deliverySummary').value,artifactRefs:refs}});
  if(!result||result.code!==0){say('交付登记失败，请重新读取工单。',true);await show(id);return;}
  say('交付已登记');el('deliverySummary').value='';el('fileRefs').value='';await show(id);await load();
}
el('filter').onchange=load;el('refresh').onclick=load;el('changeStatus').onclick=changeStatus;el('deliver').onclick=deliver;
load();
