# 职引求职小程序 2.0 上线前验收记录

验收时间：2026-07-02 16:20  
验收范围：本地自动化检查、服务端语法检查、生产接口抽检、后台运营页面可访问性、定时任务配置。

## 结论

2.0 本地代码自动化检查已通过，后端与后台运营页面已补部署到线上，核心服务在线。  
当前不建议直接提交正式版，主要阻塞项是：线上招聘功能开关关闭、支付仍为 virtual provider、题库/STAR 后台内容为空、小程序前端包尚未上传体验版并真机回归。

## 本地检查

| 项目 | 结果 | 备注 |
| --- | --- | --- |
| `npm run check:release` | 通过 | 51 个后端测试通过，fail 0 |
| `npm run check:miniprogram` | 通过 | 主包约 0.78 MB，各分包均正常 |
| `npm run check:data` | 通过，有警告 | 0 errors，3 warnings |
| 后端 JS 语法检查 | 通过 | 覆盖 routes/admin、career-assets、payment、notify 等 |

数据检查警告：
- `routes/payment.js` 包含 local endpoint 字样。
- `routes/payment.js` 包含 test/demo 文案。
- `miniprogram/package-user/pages/vip/vip.js` 包含 test/demo 文案。

## 已处理事项

| 项目 | 结果 |
| --- | --- |
| 修复 smoke test 随机端口偶发失败 | 已修复，改为系统分配空闲端口 |
| 后端 P1/P2 接口部署 | 已同步到生产 |
| 后台新页面部署 | `questions.html`、`star-templates.html`、`feedback.html` 均 200 |
| 埋点接口 | `/api/analytics/events` 生产验证 200 |
| 定时任务 | crontab 已配置聚合岗位、校招同步、提醒派发 |
| 生产备份 | `/tmp/jobapp-2.0-backup-20260702161506` |

## 线上抽检

| 接口/页面 | 结果 | 说明 |
| --- | --- | --- |
| `/api/health` | 200 | 服务在线 |
| `/api/features` | 200 | `recruitment=false`，`membership=true` |
| `/api/jobs` | 503 | 招聘功能开关关闭 |
| `/api/aggregate/jobs` | 503 | 招聘功能开关关闭 |
| `/api/payment/config` | 200 | provider=`virtual`，wxpayConfigured=false |
| `/api/notify/templates` | 200 | 已返回 6 个模板 ID |
| `/api/analytics/health` | 200 | 埋点服务在线 |
| `/api/career-assets/interview-questions` | 200 | 当前数据为空 |
| `/api/career-assets/star-templates` | 200 | 当前数据为空 |
| `/api/career-assets/daily-brief` | 401 | 需要登录，路由已存在 |
| `/admin/questions.html` | 200 | 后台题库页面可访问 |
| `/admin/star-templates.html` | 200 | 后台 STAR 模板页面可访问 |
| `/admin/feedback.html` | 200 | 后台反馈页面可访问 |

## 阻塞项

1. 线上招聘功能开关关闭  
   影响：职位列表、岗位详情、聚合岗位推荐等招聘主流程会返回 503。  
   建议：确认岗位功能准备好后，在后台功能开关打开 `recruitment`。

2. 支付仍为 virtual provider  
   影响：不是真实微信支付链路。  
   建议：正式收费前配置微信支付商户参数、证书和回调，并验证 `wxpayConfigured=true`。

3. 题库和 STAR 模板后台内容为空  
   影响：小程序端可读取后台内容，但后台没有录入时只能依赖本地兜底内容。  
   建议：上线前至少录入一批高频题和 STAR 模板。

4. 小程序前端包尚未上传体验版  
   影响：本地代码已通过检查，但用户端不会自动获得新前端。  
   建议：用微信开发者工具稳定版上传体验版，做真机回归。

5. 仍需人工真机回归  
   必测：登录、首页工作台、每日简报、职位搜索、岗位详情加入进度、收藏提醒、简历、JD 匹配、AI 网申、模拟面试、题库、STAR、反馈、设置与隐私入口。

## 建议下一步

1. 录入题库/STAR 模板基础内容。
2. 确认是否打开线上 `recruitment` 功能开关。
3. 决定是否继续使用 virtual 支付，或切换真实微信支付。
4. 上传小程序体验版并跑真机回归。
5. 真机无阻塞后再提交微信审核。
