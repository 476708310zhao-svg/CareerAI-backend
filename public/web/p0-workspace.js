'use strict';
window.createP0Workspace = function ({request,toast,openApplication,showView}) {
  const $=id=>document.getElementById(id);
  let epoch=0, manualId=null;
  function manual() { if(!manualId) manualId=`manual_${crypto.randomUUID()}`; $('manual-dialog').showModal(); }
  $('manual-cancel').onclick=()=>$('manual-dialog').close();
  $('manual-form').onsubmit=async event=>{
    event.preventDefault(); const button=event.target.querySelector('[type="submit"]'); if(button.disabled)return;
    button.disabled=true; const generation=epoch; const data=Object.fromEntries(new FormData(event.target));
    const body={jobId:manualId,sourceType:'manual',status:'preparing',deadline:data.deadline,jobSnapshot:{company:data.company,title:data.title,description:data.jd,applyUrl:data.url,location:data.location}};
    try {
      let app;
      try { app=await request('/api/v4/applications',{method:'POST',body:JSON.stringify(body)}); }
      catch(err){ if(err.status===409 && err.data?.applicationId) app={id:err.data.applicationId}; else throw err; }
      if(generation!==epoch)return;
      $('manual-dialog').close(); event.target.reset(); manualId=null; $('manual-message').textContent=''; toast('申请已加入准备中'); showView('applications'); openApplication(app.id);
    } catch(err){if(generation===epoch)$('manual-message').textContent=err.message;}
    finally{if(generation===epoch)button.disabled=false;}
  };
  function resources(){
    const cards=[['申请管理','手动记录外部岗位，安排下一步和面试日期。','applications','打开申请管线'],['简历与申请材料','当前版本在申请详情中只读展示；编辑仍请使用小程序。','applications','选择申请'],['找岗位','搜索岗位并加入申请。','jobs','搜索岗位'],['今日任务','查看和完成今天需要推进的事项。','dashboard','查看工作台']];
    $('resources-view').innerHTML=`<div class="section-head"><h3>资源中心</h3></div><div class="resource-grid">${cards.map(([title,desc,view,action])=>`<article class="card resource-card"><h3>${title}</h3><p>${desc}</p><button class="link-button" data-view="${view}">${action} →</button></article>`).join('')}<article class="card"><h3>AI 专家</h3><p>讨论求职问题；从申请详情进入可结合该申请提供建议。</p><button class="link-button" data-action="open-ai">开始问询 →</button></article></div><div class="card"><h3>小程序面试与资源工具</h3><p>简历编辑、申请材料、ATS、面试题库、STAR 练习、AI 模拟面试、竞争力陪跑和 Offer 对比仍在小程序使用。Web 仅展示已关联资料，不会在本阶段改写它们。</p></div>`;
  }
  function reset(){epoch++;manualId=null;$('manual-dialog').close();$('manual-form').reset();$('manual-form').querySelector('[type="submit"]').disabled=false;$('manual-message').textContent='';}
  return {manual,resources,reset};
};
