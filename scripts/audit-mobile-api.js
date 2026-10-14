// Read-only HTTP audit. Authenticated GETs may initialize the account's derived data.
// Pass a dedicated test user's token through the environment; never print it.
const PATHS = [
  "/api/health",
  "/api/health/ready",
  "/api/features",
  "/api/share/configs",
  "/api/banners",
  "/api/campus?pageSize=1",
  "/api/campus/meta",
  "/api/companies?pageSize=1",
  "/api/experiences?pageSize=1",
  "/api/agencies?pageSize=1",
  "/api/countries",
  "/api/exchange-rates",
  "/api/news?category=career-tips",
  "/api/payment/config",
  "/api/notify/templates",
  "/api/users/profile-schema",
  "/api/users/profile",
  "/api/resumes",
  "/api/applications",
  "/api/favorites",
  "/api/messages",
  "/api/payment/orders",
  "/api/ai/usage",
  "/api/career-assets/application-materials",
  "/api/career-assets/jd-match-reports",
  "/api/career-assets/interview-notebook",
  "/api/career-assets/interview-questions",
  "/api/career-assets/star-templates",
  "/api/jobs?pageSize=1",
  "/api/aggregate/jobs?pageSize=1",
  "/api/v4/profile",
  "/api/v4/profile/completion",
  "/api/v4/jobs",
  "/api/v4/applications/board",
  "/api/v4/resumes/templates",
  "/api/v4/resumes/experiences",
  "/api/v4/resumes",
  "/api/v4/materials/quota",
  "/api/v4/materials/drafts",
  "/api/v4/interviews/spaces",
  "/api/v4/interviews/reports",
  "/api/v4/interviews/trends",
  "/api/v4/today/tasks",
  "/api/v4/career/dashboard",
  "/api/v4/career/diagnostic",
  "/api/v4/career/plan",
  "/api/v4/career/weekly-report",
  "/api/v4/networking/dashboard",
  "/api/v4/agents",
  "/api/v4/agents/tasks",
  "/api/v4/membership/plans",
  "/api/v4/membership/status",
  "/api/v4/membership/orders",
  "/api/v4/membership/ledger",
  "/api/v4/oa/dashboard",
  "/api/v4/projects/dashboard",
  "/api/career-assets/interview-daily-practice",
  "/api/career-assets/daily-brief?date=" + new Date().toISOString().slice(0, 10)
];
async function audit({baseUrl, token, paths = PATHS}) {
  const results=[];
  for(let offset=0;offset<paths.length;offset+=3) {
    const batch=await Promise.all(paths.slice(offset,offset+3).map(async path=>{
      const started=Date.now();
      try {
        const response=await fetch(baseUrl+path,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(20000)});
        const body=await response.json();
        const state=response.ok && (body.code===undefined || body.code===0) ? 'ok'
          : response.status===503 && body.data && body.data.enabled===false ? 'disabled'
          : response.status===401 && !token ? 'auth-required' : 'failed';
        return {path,status:response.status,code:body.code,state,durationMs:Date.now()-started,
          ...(state==='failed'?{message:String(body.message||body.error||'').slice(0,160)}:{})};
      } catch(error) {return {path,state:'failed',message:error.message,durationMs:Date.now()-started};}
    }));
    results.push(...batch);
  }
  return {checkedAt:new Date().toISOString(),baseUrl,counts:results.reduce((a,r)=>(a[r.state]=(a[r.state]||0)+1,a),{}),results};
}
module.exports={audit,PATHS};
if(require.main===module) audit({baseUrl:process.env.API_AUDIT_BASE_URL||'http://127.0.0.1:4400',token:process.env.API_AUDIT_TOKEN||''}).then(report=>{
  console.log(JSON.stringify(report,null,2));
  if(report.counts.failed)process.exitCode=1;
}).catch(error=>{console.error(error.message);process.exitCode=1});
