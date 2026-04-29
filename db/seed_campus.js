const db = require('./database');

const ins = db.prepare(`
  INSERT INTO campus_schedules
  (company, industry, recruit_type, locations, position_name, start_date, deadline_date,
   written_test, apply_url, announce_url, grad_year, region, position_type, recruit_year,
   is_hot, notes, is_verified)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const rows = [
  // ── 国内暑期实习 ──
  ['顺丰科技','互联网','暑期实习','["深圳","武汉","成都"]','算法及大数据开发工程师','2026-04-03','尽快投递','仅测评','https://campus.sf-express.com','https://mp.weixin.qq.com/s/sfkj2026',2027,'中国内地','技术',2026,1,'顺丰暑期实习，直推转正',1],
  ['国泰基金','金融','暑期实习','["上海"]','投研管培生/财务','2026-04-03','尽快投递','需要笔试','https://campus.gtfund.com','https://mp.weixin.qq.com/s/gtfund',2027,'中国内地','金融',2026,1,'公募基金实习，含量化方向',1],
  ['腾讯','互联网','暑期实习','["北京","深圳","上海","成都"]','技术/产品/运营','2026-03-15','2026-05-31','仅测评','https://join.qq.com','https://join.qq.com',2027,'中国内地','技术',2026,1,'腾讯暑期实习，转正率高',1],
  ['字节跳动','互联网','暑期实习','["北京","上海","杭州","深圳"]','后端/前端/算法/产品','2026-03-01','2026-05-15','仅测评','https://jobs.bytedance.com','https://jobs.bytedance.com',2027,'中国内地','技术',2026,1,'字节全线暑期实习',1],
  ['百度','互联网','暑期实习','["北京","上海","深圳","成都"]','算法/研发/产品','2026-03-25','2026-05-25','仅测评','https://talent.baidu.com','https://talent.baidu.com',2027,'中国内地','技术',2026,1,'百度暑期实习，含AI岗',1],
  ['美团','互联网','暑期实习','["北京","上海","深圳"]','研发/产品/数据科学','2026-04-01','2026-05-30','仅测评','https://campus.meituan.com','https://campus.meituan.com',2027,'中国内地','技术',2026,1,'美团暑期实习',1],
  ['滴滴出行','互联网','暑期实习','["北京","上海"]','算法/研发/产品','2026-04-01','2026-05-31','仅测评','https://talent.didiglobal.com','https://talent.didiglobal.com',2027,'中国内地','技术',2026,0,'滴滴暑期实习',0],
  ['高盛','金融','暑期实习','["香港","北京","上海"]','IBD/Sales&Trading/Risk','2026-02-01','2026-03-31','含免笔试','https://goldmansachs.com/careers','https://goldmansachs.com/careers/asia',2027,'中国内地','金融',2026,1,'高盛亚洲暑期实习',1],
  // ── 国内春招 ──
  ['阿里巴巴','互联网','春招','["杭州","北京","上海"]','技术/产品/运营/数据','2026-03-20','2026-05-20','仅测评','https://campus.alibaba.com','https://campus.alibaba.com',2027,'中国内地','技术',2026,1,'阿里春招，届次不限',1],
  ['京东','互联网','春招','["北京","上海","武汉"]','技术/产品/运营','2026-03-10','2026-05-10','需要笔试','https://campus.jd.com','https://campus.jd.com',2027,'中国内地','技术',2026,0,'京东春招',1],
  ['吉林银行','金融','春招','["长春","吉林","沈阳","哈尔滨","大连"]','总行管理培训生','2026-04-03','2026-04-20','需要笔试','http://jlba.com/campus','https://mp.weixin.qq.com/s/jlbank',2026,'中国内地','金融',2026,0,'吉林银行春招管培生',0],
  ['先导智能','其他','春招','["无锡","珠海","成都"]','集团战略管培生','2026-04-03','尽快投递','仅测评','https://leader-cn.jobs.com','https://mp.weixin.qq.com/s/leader',2026,'中国内地','综合',2026,0,'先导智能管培生',0],
  ['吉利汽车集团','新能源','春招','["全国各地"]','国际管培生','2026-04-03','尽快投递','仅测评','https://hr.geely.com','https://mp.weixin.qq.com/s/geely',2026,'中国内地','综合',2026,1,'吉利国际管培，海外轮岗',1],
  ['淘天集团','互联网','春招','["北京","杭州"]','AI应用研发工程师','2026-04-03','2026-06-30','仅测评','https://campus.taobao.com','https://mp.weixin.qq.com/s/taotian',2027,'中国内地','技术',2026,1,'淘天AI岗春招',1],
  ['麦肯锡','咨询','春招','["北京","上海","香港"]','BA商业分析师','2026-01-10','2026-02-28','含免笔试','https://www.mckinsey.com/careers','https://www.mckinsey.com/careers/apply',2026,'中国内地','咨询',2026,1,'McKinsey BA，精英项目',1],
  ['BCG波士顿咨询','咨询','春招','["北京","上海","深圳"]','Associate咨询顾问','2026-01-15','2026-03-15','含免笔试','https://careers.bcg.com','https://careers.bcg.com/zh-cn',2026,'中国内地','咨询',2026,1,'BCG咨询顾问春招',1],
  ['合肥热电集团','国央企','春招','["合肥"]','综合管理类','2026-04-03','2026-04-17','需要笔试','https://hfrdjt.com/campus','https://gz.hfrdjt.com',2026,'中国内地','综合',2026,0,'国企合肥热电管培',0],
  ['止一税务','咨询','春招','["深圳"]','税务合伙人助理','2026-04-03','尽快投递','含免笔试','https://zhiyitax.com','https://mp.weixin.qq.com/s/zhiyi',2026,'中国内地','咨询',2026,0,'止一税务春招',0],
  // ── 国内秋招 ──
  ['华为','通信/硬件','秋招','["深圳","北京","上海","成都","西安","武汉"]','2026届全岗位','2025-09-01','2025-10-31','需要笔试','https://career.huawei.com','https://career.huawei.com/reccampus',2026,'中国内地','技术',2025,1,'华为秋招，含海外HC',1],
  ['中国银行','国央企','秋招','["全国各地"]','综合管培/金融科技','2025-09-01','2025-10-31','需要笔试','https://campus.boc.cn','https://campus.boc.cn',2026,'中国内地','金融',2025,0,'中国银行秋招',1],
  ['招商银行','金融','秋招','["全国各地"]','零售管培生/科技','2025-09-15','2025-11-15','需要笔试','https://campus.cmbchina.com','https://campus.cmbchina.com',2026,'中国内地','金融',2025,0,'招商银行秋招',1],
  // ── 北美暑期实习 ──
  ['Google','互联网','暑期实习','["Mountain View","New York","Seattle"]','SWE Intern / PM Intern','2025-09-01','2025-12-31','含免笔试','https://careers.google.com/jobs/results/','https://careers.google.com',2027,'北美','技术',2026,1,'Google Summer Internship，OPT友好',1],
  ['Meta','互联网','暑期实习','["Menlo Park","Seattle","New York"]','SWE Intern / Data Scientist','2025-09-15','2026-01-15','含免笔试','https://metacareers.com','https://metacareers.com/student',2027,'北美','技术',2026,1,'Meta Internship，含Infra/ML',1],
  ['Microsoft','互联网','暑期实习','["Redmond","Seattle","New York"]','SWE Intern / PM Intern','2025-09-01','2025-12-15','含免笔试','https://careers.microsoft.com','https://careers.microsoft.com/students',2027,'北美','技术',2026,1,'Microsoft全线实习，PM岗竞争激烈',1],
  ['Amazon','互联网','暑期实习','["Seattle","New York","San Francisco"]','SDE Intern / TPM Intern','2025-08-01','2025-12-31','含免笔试','https://amazon.jobs','https://amazon.jobs/en/teams/internships',2027,'北美','技术',2026,1,'Amazon SDE，Return Offer率高',1],
  ['Apple','互联网','暑期实习','["Cupertino","Austin","Seattle"]','SWE Intern / ML Intern','2025-10-01','2026-02-28','含免笔试','https://jobs.apple.com','https://jobs.apple.com/students',2027,'北美','技术',2026,1,'Apple实习，竞争激烈',1],
  ['Goldman Sachs','金融','暑期实习','["New York","San Francisco"]','IBD / S&T / Quant','2025-08-01','2025-11-30','含免笔试','https://goldmansachs.com/careers','https://goldmansachs.com/careers/students',2027,'北美','金融',2026,1,'Goldman北美暑期实习',1],
  ['Jane Street','金融','暑期实习','["New York"]','Trader / Quant Researcher / SWE','2025-08-01','2025-12-31','含免笔试','https://janestreet.com/join-jane-street','https://janestreet.com/join-jane-street/internship',2027,'北美','金融',2026,1,'Jane Street，Quant精英',1],
  ['Citadel','金融','暑期实习','["Chicago","New York","Miami"]','SWE / Quant Research / Trading','2025-09-01','2026-01-15','含免笔试','https://careers.citadel.com','https://careers.citadel.com/internships',2027,'北美','金融',2026,1,'Citadel对冲基金实习',1],
  ['Nvidia','互联网','暑期实习','["Santa Clara","Austin"]','CUDA SWE / ML Infra / Deep Learning','2025-09-01','2026-01-15','含免笔试','https://nvidia.com/careers','https://nvidia.com/careers/internships',2027,'北美','技术',2026,1,'NVIDIA AI方向实习',1],
  ['OpenAI','互联网','暑期实习','["San Francisco"]','Research Scientist Intern / SWE','2025-11-01','2026-03-31','含免笔试','https://openai.com/careers','https://openai.com/careers/internships',2027,'北美','技术',2026,1,'OpenAI实习，最热门',1],
  ['Netflix','互联网','暑期实习','["Los Gatos","Los Angeles"]','SWE Intern / Data Intern','2025-10-01','2026-01-31','含免笔试','https://jobs.netflix.com','https://jobs.netflix.com/internships',2027,'北美','技术',2026,0,'Netflix实习',0],
  ['McKinsey USA','咨询','秋招','["New York","Chicago","San Francisco"]','BA Business Analyst','2025-09-01','2025-11-01','含免笔试','https://mckinsey.com/careers','https://mckinsey.com/careers/apply',2026,'北美','咨询',2025,1,'McKinsey BA Full-time',1],
  ['Two Sigma','金融','暑期实习','["New York"]','Quant Research / SWE Intern','2025-08-01','2025-12-01','含免笔试','https://twosigma.com/careers','https://twosigma.com/careers/open-positions',2027,'北美','金融',2026,1,'Two Sigma量化对冲基金',1],
  // ── 英国 ──
  ['Goldman Sachs London','金融','暑期实习','["London"]','IBD / S&T Summer Analyst','2025-10-01','2026-01-31','含免笔试','https://goldmansachs.com/careers','https://goldmansachs.com/careers/students/programs',2027,'英国','金融',2026,1,'Goldman Sachs London夏季实习',1],
  ['KPMG UK','咨询','春招','["London","Manchester","Birmingham"]','Graduate Programme','2025-09-01','2025-12-01','需要笔试','https://kpmgcareers.co.uk','https://kpmgcareers.co.uk/programmes',2026,'英国','咨询',2025,0,'KPMG UK毕业生项目',1],
  ['Deloitte UK','咨询','春招','["London","Edinburgh","Leeds"]','Graduate Programme','2025-09-15','2025-12-15','需要笔试','https://deloitte.com/uk/careers','https://deloitte.com/uk/en/pages/careers/articles/careers-home.html',2026,'英国','咨询',2025,0,'Deloitte UK毕业生项目',1],
  ['Barclays','金融','暑期实习','["London"]','Technology / Investment Banking','2025-10-01','2025-12-31','含免笔试','https://home.barclays/careers','https://home.barclays/careers/early-careers',2027,'英国','金融',2026,1,'Barclays暑期实习',1],
  ['Amazon UK','互联网','暑期实习','["London","Edinburgh"]','SDE Intern / PM Intern','2025-09-01','2025-12-31','含免笔试','https://amazon.jobs','https://amazon.jobs/students',2027,'英国','技术',2026,1,'Amazon UK实习',1],
  ['Jane Street London','金融','暑期实习','["London"]','Trader / Quant Research Intern','2025-09-01','2025-12-31','含免笔试','https://janestreet.com/join','https://janestreet.com/join-jane-street/internship',2027,'英国','金融',2026,1,'Jane Street伦敦实习',1],
];

const insertAll = db.transaction((data) => {
  let cnt = 0;
  for (const r of data) { ins.run(...r); cnt++; }
  return cnt;
});

const n = insertAll(rows);
console.log('插入成功:', n, '条');
console.log('总数:', db.prepare('SELECT COUNT(*) as c FROM campus_schedules').get().c);
