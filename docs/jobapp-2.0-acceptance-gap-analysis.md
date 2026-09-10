# 职引求职小程序 2.0 产品功能验收与缺口分析

验收日期：2026-07-01  
验收方式：基于当前代码仓库静态验收，覆盖小程序前端、后端接口、管理后台与脚本。未包含微信真机、生产定时任务、线上支付商户号和订阅消息模板实际发送验证。

## 一、总体结论

当前 2.0 已经具备“求职工作台 + 求职进度 + 收藏提醒 + 简历/JD匹配 + AI面试 + 题库留存 + 后台运营”的主要产品骨架，很多功能不是纯页面展示，已经接入本地存储、后端接口或后台管理。

但从“可以稳定推送上线”的角度看，仍存在若干高风险缺口：订阅消息模板 ID 前端配置不完整且疑似与已提供模板不一致；求职进度主流程仍偏本地化，未形成完整云端闭环；数据埋点和渠道归因不成体系；AI网申助手仍是模板化生成；隐私合规缺少用户自助注销和删除 AI/语音/报告记录的完整入口。

建议结论：2.0 可作为内测/灰度版本继续验证核心体验，但不建议按“完整 2.0 正式版”直接推全量上线。上线前至少应优先修复订阅消息、进度云同步、埋点、隐私删除与后台运营缺口。

## 二、已完成模块

1. 首页已具备工作台基础形态  
   相关文件：`miniprogram/pages/index/index.js`、`miniprogram/pages/index/index.wxml`、`miniprogram/utils/job-progress.js`  
   已有每日简报入口、求职进度卡片、推荐岗位、即将截止/今日面试统计、AI建议等内容。

2. 求职进度前端闭环已完成  
   相关文件：`miniprogram/utils/job-progress.js`、`miniprogram/package-user/pages/job-progress/job-progress.js`、`miniprogram/package-user/pages/job-detail/job-detail.js`  
   支持从岗位详情加入进度，支持已收藏、已投递、网申中、OA阶段、一面、二面、HR面、Offer、拒信、已结束等状态，支持备注、截止时间、面试时间。

3. 岗位收藏与收藏列表已可用  
   相关文件：`miniprogram/utils/favorites.js`、`miniprogram/package-user/pages/favorites/favorites.js`、`routes/favorites.js`  
   支持岗位/面经/公司/机构/校招收藏，本地与服务端同步。

4. 提醒能力已有接口和调度脚本  
   相关文件：`miniprogram/utils/reminders.js`、`routes/notify.js`、`scripts/dispatch_reminders.js`、`scripts/run-reminder-dispatch.sh`  
   已有提醒创建、查询、删除、发送、去重记录和服务端调度脚本。

5. 每日简报已接入真实本地业务数据  
   相关文件：`miniprogram/package-ai/pages/daily-brief/daily-brief.js`、`miniprogram/utils/job-progress.js`、`miniprogram/utils/interview-notebook.js`  
   已展示今日推荐、即将截止、投递进度、今日面试、今日必练、快讯和 AI建议；当前 `ENABLE_DEMO_FALLBACK` 为 `false`。

6. 简历 CRUD、PDF 上传和删除已完成基础能力  
   相关文件：`miniprogram/package-career/pages/resume/resume.js`、`routes/resumes.js`、`routes/upload.js`  
   支持在线简历创建、编辑、删除、PDF 上传、解析和删除。

7. JD 匹配评分已结构化  
   相关文件：`miniprogram/package-user/pages/job-detail/job-detail.js`、`miniprogram/utils/jd-match.js`、`routes/career-assets.js`  
   岗位详情页已有“测匹配度”，可生成匹配分、缺失关键词、ATS风险、项目建议、优化建议，并可保存报告。

8. AI 面试训练核心流程已完成  
   相关文件：`miniprogram/package-ai/pages/interview-setup/interview-setup.js`、`miniprogram/package-ai/pages/interview-dialog/interview-dialog.js`、`miniprogram/package-ai/pages/ai-report/ai-report.js`  
   支持模拟面试设置、AI对话、报告、问题回顾、再次练习入口。

9. 面试题库留存能力已有基础  
   相关文件：`miniprogram/package-content/pages/question-detail/question-detail.js`、`miniprogram/package-ai/pages/interview-notebook/interview-notebook.js`、`miniprogram/utils/interview-notebook.js`  
   支持收藏/已做、本题加入错题本、标记不会/已掌握、加入每日练习，并有服务端同步接口。

10. 后台已有基础运营模块  
    相关文件：`admin/js/common.js`、`admin/jobs.html`、`admin/campus.html`、`admin/experiences.html`、`admin/banners.html`、`admin/users.html`、`admin/resumes.html`、`admin/share.html`、`admin/features.html`  
    已覆盖岗位、校招、面经、Banner、用户、简历、分享配置、功能开关等基础运营。

## 三、部分完成模块

1. 首页“今日求职工作台”：已有工作台概览和每日简报入口，但缺少可勾选、可完成、可追踪的今日任务队列。
2. 求职进度闭环：前端本地闭环完整，但进度编辑、状态流转、备注、截止时间、面试时间等没有统一云端 CRUD。
3. 岗位收藏和提醒：收藏与提醒接口真实存在，但微信订阅消息前端模板 ID 配置存在空值/疑似错字，生产 cron 需服务器侧确认。
4. 每日简报真实数据：简报主体不是 mock，但推荐岗位依赖首页缓存 `cachedRecommendJobs`，没有独立后端日报 API、日报历史、日报任务完成记录。
5. 简历功能：已支持多版本在线简历和 PDF 简历，但默认简历缺少后端字段，目标岗位绑定是临时输入，历史优化记录没有独立存档。
6. JD 匹配评分：结构化报告已可生成和保存，但只读取本地 `onlineResume`，没有简历选择器；匹配算法主要是关键词启发式。
7. AI 网申助手：已有岗位选择、问题类型、草稿生成和申请材料保存，但缺少 JD 粘贴/读取入口，生成逻辑仍是本地模板。
8. 面试训练闭环：对话和报告闭环存在，但报告收藏错题写入 `bookmarkedQuestions`，题库错题本使用 `interviewMistakeNotebook`，两套数据未统一。
9. 内容页面行动化：题目详情和面经详情行动较完整；快讯详情主要是复制链接/分享，校招详情主要是收藏/提醒/复制投递链接。
10. 分享能力：`miniprogram/app.js` 通过 `miniprogram/utils/share.js` 全局注入分享能力，并有后台分享配置；但大量工具/私密页被排除朋友圈分享，且没有完整 scene/渠道来源统计。
11. 隐私与合规：有隐私政策、微信隐私指引入口、反馈式数据删除申请、简历删除；但缺少自助注销账号、删除 AI 记录、删除语音记录、删除面试报告等完整产品化入口。

## 四、未完成模块

1. 全链路数据埋点体系：未发现统一 `analytics`/`trackEvent` 工具和稳定事件上报接口。
2. 渠道归因和 scene 统计闭环：分享配置已存在，但没有看到对 `scene`、渠道来源、分享落地页转化的统一解析、存储和报表。
3. 后台题库管理：当前有前端题库和留存接口，但后台未见独立题库管理页面。
4. 后台 STAR 模板管理：前端有 STAR 模板库，但后台未见独立模板管理页面。
5. 后台用户反馈管理：小程序有反馈入口和接口，但后台未见独立反馈处理页面。
6. 求职进度云端完整模型：当前 `routes/applications.js` 更偏投递记录，未覆盖 2.0 求职进度的完整字段和状态同步。
7. 用户自助注销与全量数据删除：设置页目前是“申请处理”模式，缺少真实自助注销 API、数据擦除 API 和处理状态。
8. AI/语音/面试报告删除闭环：当前多为本地记录或临时记录，缺少统一的服务端记录、列表和删除能力。

## 五、高风险缺口

1. 订阅消息模板 ID 风险  
   `miniprogram/utils/app-config.js` 中 `WX_TPL_INTERVIEW` 为空，`WX_TPL_APPLICATION`、`WX_TPL_SYSTEM` 与已提供模板 ID 疑似不一致。会导致前端 `wx.requestSubscribeMessage` 申请失败或申请错误模板。

2. 求职进度非云端闭环  
   进度页核心数据来自本地 `localApplications`。用户换手机、清缓存或多端使用时，状态、备注、截止时间、面试时间可能丢失。

3. 提醒发送依赖生产 cron 未确认  
   代码有 `scripts/run-reminder-dispatch.sh`，但代码仓库无法证明线上已配置 cron/systemd 定时执行。

4. 数据埋点缺失影响运营判断  
   2.0 新增功能较多，但没有统一埋点，无法判断首页工作台、每日简报、JD匹配、AI网申、面试训练的真实转化。

5. AI 网申助手能力声明与实现不一致  
   当前草稿生成主要使用 `miniprogram/utils/application-materials.js` 模板拼接，缺少 JD 输入和 AI 请求。

6. 面试错题本数据割裂  
   AI报告页加入错题本和题目详情页错题本使用不同 storage key，用户可能在错题本页面找不到从报告收藏的问题。

7. 隐私合规仍偏人工处理  
   隐私政策已写明权利，但产品内没有足够的自助删除/注销能力支撑，正式上线前需补齐。

8. 后台运营缺口会影响内容增长  
   题库、STAR模板、反馈、快讯/资讯的后台能力不完整，运营侧后续会依赖开发改数据。

## 六、建议优先补充的 10 个任务

| 优先级 | 任务 | 涉及文件路径 | 修改建议 |
| --- | --- | --- | --- |
| P0 | 修正订阅消息模板配置 | `miniprogram/utils/app-config.js`、`miniprogram/utils/reminders.js`、`routes/notify.js` | 将已确认的模板 ID 写入前端配置；优先改为从 `/api/notify/templates` 拉取并缓存，避免前后端模板不一致；补齐面试通知模板。 |
| P0 | 求职进度云端同步 | `miniprogram/utils/job-progress.js`、`miniprogram/package-user/pages/job-progress/job-progress.js`、`routes/applications.js` 或新增 `routes/job-progress.js` | 新增完整进度表字段：status、notes、deadline、interviewTime、resumeVersionId、sourceJobId；进度增删改查走后端，本地仅做缓存。 |
| P0 | 增加核心数据埋点 | 新增 `miniprogram/utils/analytics.js`、新增 `routes/analytics.js`，改 `pages/index/index.js`、`package-user/pages/job-detail/job-detail.js`、`package-ai/pages/interview-dialog/interview-dialog.js` 等 | 统一 `track(eventName, payload)`；覆盖首页访问、岗位详情、收藏、提醒、简历上传、AI使用、模拟面试开始/完成、报告查看、分享、转化点击。 |
| P0 | 完成隐私合规自助入口 | `miniprogram/package-user/pages/settings/settings.js`、`miniprogram/package-user/pages/settings/settings.wxml`、`routes/users.js`、`routes/upload.js`、`routes/career-assets.js` | 增加注销账号、删除简历、删除申请材料、删除 AI记录、删除面试报告、删除语音记录的可执行 API 和前端确认流程。 |
| P1 | 首页今日任务队列 | `miniprogram/pages/index/index.js`、`miniprogram/pages/index/index.wxml`、`miniprogram/utils/job-progress.js`、`miniprogram/utils/interview-notebook.js` | 将截止投递、今日面试、每日必练、简历优化、待跟进岗位整理成任务列表，支持完成状态和跳转行动。 |
| P1 | 每日简报服务端化 | `miniprogram/package-ai/pages/daily-brief/daily-brief.js`、新增或扩展 `routes/career-assets.js` | 增加日报生成/读取/历史接口；推荐岗位不要只依赖首页缓存；保存每日 AI建议和行动计划。 |
| P1 | 升级 AI 网申助手 | `miniprogram/package-ai/pages/ai-assistant/ai-assistant.js`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.wxml`、`miniprogram/utils/application-materials.js`、`routes/ai.js` | 增加 JD 粘贴/读取输入、简历选择、岗位选择、问题类型选择；生成改为调用 AI接口；保存草稿时带 JD、简历版本和岗位 ID。 |
| P1 | 简历默认版本、目标岗位和优化历史 | `miniprogram/package-career/pages/resume/resume.js`、`miniprogram/package-career/pages/resume/resume.wxml`、`routes/resumes.js` | 后端增加 `is_default`、`target_role`、`target_job_id`、`optimization_history` 或独立历史表；JD匹配和网申助手使用默认/所选简历。 |
| P1 | 统一面试错题本与复习提醒 | `miniprogram/package-ai/pages/ai-report/ai-report.js`、`miniprogram/utils/interview-notebook.js`、`miniprogram/package-ai/pages/interview-notebook/interview-notebook.js`、`miniprogram/utils/reminders.js` | AI报告页加入错题本时改用 `interview-notebook` 工具；增加复习提醒配置和订阅消息发送。 |
| P2 | 补齐后台运营页面 | `admin/js/common.js`、新增 `admin/questions.html`、`admin/star-templates.html`、`admin/feedback.html`、必要时新增 `admin/news.html`、扩展 `routes/admin.js` | 后台菜单加入题库管理、STAR模板管理、反馈管理、快讯/资讯管理；提供搜索、上下架、编辑、删除、排序。 |

## 七、按验收项逐条结论

| 验收项 | 结论 | 说明 |
| --- | --- | --- |
| 首页升级为今日求职工作台 | 部分完成 | 有工作台概览和每日简报入口，但缺少可完成的今日任务队列。 |
| 求职进度闭环 | 部分完成 | 前端状态流转完整，云端同步不完整。 |
| 岗位收藏和提醒真实可用 | 部分完成 | 收藏真实可用，提醒接口存在；订阅模板和生产定时任务需确认。 |
| 每日简报真实数据 | 部分完成 | 使用真实本地/缓存数据，不是 mock；缺少服务端日报。 |
| 简历功能完整 | 部分完成 | CRUD/PDF 完成；默认简历、目标绑定、优化历史不足。 |
| JD匹配评分结构化 | 部分完成 | 报告结构完整；缺少简历选择和 AI语义匹配。 |
| AI网申助手流程化 | 部分完成 | 有流程入口和保存材料；缺少 JD 输入和真实 AI生成。 |
| 面试训练闭环 | 部分完成 | 训练/报告完整；错题本数据未统一，报告持久化不足。 |
| 面试题库留存 | 部分完成 | 收藏、错题、掌握、每日练习已有；复习提醒未完成。 |
| 内容页面行动化 | 部分完成 | 题目/面经较好，快讯/校招转化不足。 |
| 分享和渠道追踪 | 部分完成 | 全局分享注入和后台配置存在；渠道追踪缺失。 |
| 数据埋点 | 未完成 | 未见统一埋点系统。 |
| 后台运营能力 | 部分完成 | 基础运营完成，题库/STAR/反馈/快讯后台不足。 |
| 隐私和合规 | 部分完成 | 政策和申请入口已有，自助删除/注销不足。 |

## 八、上线建议

如果目标是内测：可以上线灰度，但建议关闭或弱化尚未完整的“AI网申”“提醒必达”“完整工作台”宣传口径。

如果目标是正式版：建议至少完成 P0 的 4 项任务后再发版，即订阅消息模板修正、求职进度云同步、核心埋点、隐私合规自助入口。
