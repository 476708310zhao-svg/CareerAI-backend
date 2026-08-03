# DEVELOPMENT_STATUS

更新时间：2026-08-03

后端项目目录：`C:\Users\admin\Desktop\求职小程序\jobapp-server`

小程序项目目录：`C:\Users\admin\Desktop\求职小程序\求职小程序`

## 当前批次

第二批 P1 优化已完成，P2 正在进行：降低维护成本、补工程化和测试覆盖。继续避免主动改动支付、登录等高风险核心链路。

## 已完成

| 日期 | 事项 | 文件 | 验证 |
|---|---|---|---|
| 2026-08-03 | 清理职位详情、职位列表、个人中心、公司详情等非 AI 专属页面的顶部 AI 说明；职位收藏改为静默开启截止提醒，优先使用岗位真实截止日，无截止日时默认收藏后 30 天，并提前 3 天和 1 天提醒 | 小程序普通页面 WXML、`utils/favorite-reminder.js`、`utils/favorites.js`、职位列表/详情、收藏夹与测试 | 全量测试 118/118、`check:miniprogram` 与数据检查通过；微信开发者工具预览编译成功，主包 777.7 KB |
| 2026-08-03 | 将 AI 求职规划从简短关键词清单升级为可执行方案：补充岗位结论与假设、能力差距、技能练习与证明、项目蓝图、阶段交付物与量化指标、6 个里程碑、每周执行节奏和风险预案；生成改为两部分并行 JSON 并增加完整度质量门禁 | `services/careerPlanGenerator.js`、`routes/ai.js`、小程序 `package-career/pages/career-planner/*` 与回归测试 | 全量测试 115/115、小程序检查与微信预览编译通过；真实方舟模型 43 秒生成，质量门禁 9/9；生产 readiness 与公网健康检查通过 |
| 2026-08-03 | 优化编辑资料页多选交互：已选地区、行业、岗位和技能时，将继续搜索缩短为卡片右上角“继续添加”按钮；毕业年份从固定标签改为 1970 年至未来 20 年的年份选择器 | 小程序 `package-user/pages/profile-edit/*` 与导航回归测试 | 导航回归 11/11、全量测试 111/111、`check:miniprogram` 通过；微信开发者工具预览编译成功，主包 776.6 KB |
| 2026-08-03 | 将隐藏的职业工具中心功能并入资源中心：新增 AI 求职规划、简历中心和 Offer 对比入口，复用已有薪酬查询与职业洞察入口；原职业工具中心收口为单一 AI 求职规划页 | 小程序 `pages/resources/*`、`package-career/pages/career-planner/*` 与导航回归测试 | 导航回归 10/10、全量测试 110/110、`check:miniprogram` 通过；微信开发者工具预览编译成功，主包 776.6 KB |
| 2026-08-03 | 隐藏“我的简历”页面及内部纵向滚动区域的滚动指示器，并将基本信息与个人优势合并为同一卡片 | 小程序 `package-career/pages/resume/resume.wxml`、`resume.wxss` 与导航回归测试 | 页面回归 10/10、`check:miniprogram` 通过；微信开发者工具预览编译成功，主包 776.0 KB |
| 2026-08-03 | 修复 AI 简历润色长期误走 `fallback-rules`、建议与原文相同、时间戳和个人隐私被当作优化内容的问题；完善降级标识并发布后端修复 | `services/v4AiRuntime.js`、`services/v4ResumeCenter.js`、小程序 `resume-center`、测试与 AI 运行文档 | `check:release` 通过，109/109 tests、内容错误 0；生产 readiness 全通过，DeepSeek 实测 `source=live`、无降级 |
| 2026-07-29 | 修复底部导航“进度”和“AI专家”未选中仍显示蓝色的问题，为两项补充独立灰色未选中图标，保留品牌蓝作为选中状态并增加防回归检查 | 小程序 `custom-tab-bar/index.js`、`app.json`、`images/*-muted.png` 与导航测试 | 导航测试 9/9、`check:miniprogram` 通过；微信开发者工具预览成功，主包 776.0 KB |
| 2026-07-29 | 修复上线审核阻断风险：面经、评论、回复和机构评价实行发布前人工审核，公开接口仅展示已通过内容；后台支持通过/驳回并保留审核日志，评论数与机构评分按审核状态联动；隐私政策同步虚拟支付、运营主体和社区审核规则 | `db/database.js`、UGC/API 路由、后台审核页、小程序提交反馈、隐私政策、测试与 `docs/UGC_MODERATION_RELEASE.md` | `check:release` 通过，105/105 tests、内容错误 0；微信开发者工具预览编译通过，主包 771.6 KB |
| 2026-07-29 | 将全端登录受限入口统一为当前页登录弹层，登录成功后自动继续原操作；登录弹层替换为压缩后的职引品牌 Logo | 小程序 `components/c-login-popup`、`behaviors/login-gate.js`、进度/AI 专家/岗位/简历/面经/机构/薪资/会员/设置/面试页面及回归测试 | `check:release` 通过，101/101 tests、内容错误 0；微信开发者工具预览编译通过，主包约 770.6 KB |
| 2026-07-20 | 按产品参考图重新制作资源中心：自定义导航、大标题、校招日历主视觉、横向双列工具卡和内容服务列表 | 小程序 `pages/resources`、回归测试与 V4 文档 | `check:release` 通过，91/91 tests、内容错误 0，主包约 0.96 MB |
| 2026-07-20 | 首页校招从双列瀑布流调整为单列最新信息流，每个岗位独占一行并按更新时间倒序；资源中心按求职任务重新分组并全面优化视觉层级 | 小程序 `pages/index`、`pages/resources`、`components/home-campus-updates`、测试与 V4 文档 | `check:release` 通过，91/91 tests、内容错误 0，主包约 0.96 MB |
| 2026-07-20 | 将“校招”一级 Tab 升级为资源中心，聚合题库、STAR、薪酬、公司、OA、AI 面试、技能路径、校招和资讯等入口；首页移除求职情报并改为最多 8 条校招日历双列瀑布流 | 小程序 `pages/resources`、`pages/index`、`components/home-campus-updates`、`custom-tab-bar`、导航调用、测试与 V4 文档 | `check:release` 通过，91/91 tests、内容错误 0，主包约 0.96 MB |
| 2026-07-17 | 修复线上 V4 Agent 路由未部署导致的 404：关闭未部署路由探测、切换旧 AI 通道、本机保存兼容任务、禁用兼容写操作，并接受 HTTP 201 等全部 2xx 写请求 | 小程序 `pages/ai-career`、`utils/app-config.js`、`utils/agent-compat.js`、`utils/api-client.js` 与回归测试 | `check:release` 通过，90/90 tests、内容错误 0，主包约 0.95 MB；生产 V4 后端仍需独立发布 |
| 2026-07-17 | 优化 V4 一级导航中文文案：`Today` 改为“首页”，承载校招日历的“岗位”改为“校招” | 小程序 `app.json`、`custom-tab-bar`、导航测试与 V4 文档 | `check:release` 通过，85/85 tests、内容错误 0，主包约 0.95 MB |
| 2026-07-17 | 恢复全局 AI 悬浮助手，并在首页恢复紧凑会员权益横幅；会员关闭时明确提示真实微信支付未开放 | 小程序 `custom-tab-bar`、`pages/index`、导航防回归测试与首页文档 | `check:release` 通过，85/85 tests、内容错误 0，主包约 0.95 MB |
| 2026-07-17 | 重构 AI Career 主页面 UI：紧凑顶部、2×2 Agent 网格、快捷提问、上下文编排、任务历史与结果弹层 | 小程序 `pages/ai-career`、`components/c-ai-disclosure` | `check:release` 通过，84/84 tests、内容错误 0，主包约 0.94 MB |
| 2026-07-17 | 修复求职进度线上响应异常：兼容旧响应、登录失效、本机记录回退与离线新增保存 | 小程序 `pages/applications`、`utils/application-workbench.js` | `check:release` 通过，84/84 tests、内容错误 0 |
| 2026-07-17 | 将“申请”升级为“求职进度”工作台：本周重点、申请漏斗、准备度、优先级排序、快捷入口与手动新增申请 | 小程序 `pages/applications`、`utils/application-workbench.js`、TabBar 与测试 | `check:release` 通过，82/82 tests、内容错误 0，主包约 0.92 MB |
| 2026-07-17 | 将 V4“岗位”一级 Tab 调整为直接承载校招日历，并迁移旧 `switchTab` 入口 | 小程序 `app.json`、`custom-tab-bar`、导航工具及岗位返回入口 | `check:release` 通过，79/79 tests、导航测试 3/3、内容错误 0 |
| 2026-05-09 | 提交并推送第一批安全修复记录和基础 smoke tests | `AI功能清单开发.md`、`tests/smoke.test.js` | `npm test` 通过，4/4 |
| 2026-05-09 | 新增多 AI 协作规则 | `AGENTS.md` | 文档检查 |
| 2026-05-09 | 新增开发状态跟踪 | `DEVELOPMENT_STATUS.md` | 文档检查 |
| 2026-05-09 | 补充 README 开发、测试、环境变量和协作说明 | `README.md` | 文档检查 |
| 2026-05-09 | 扩展后端 smoke tests，覆盖登录、支付 Mock、上传异常和公开列表 | `tests/smoke.test.js` | `npm test` 通过，11/11 |
| 2026-05-09 | 迁移第一批小程序直接请求到统一 API 模块 | 小程序 `messages`、`feedback`、`news` 页面与 `utils/api-*` | `rg` 无残留，`node --check` 通过 |
| 2026-05-09 | 输出简历 API 去重方案 | `docs/RESUME_API_DEDUP_PLAN.md` | 文档检查 |
| 2026-05-09 | 输出 API 响应格式规范 | `docs/API_RESPONSE_CONVENTION.md` | 文档检查 |
| 2026-05-09 | 固定 `data/jobs.json` 为唯一本地职位数据源，停止创建/导入/读取 SQLite `jobs` 双轨 | `db/database.js`、`db/seed.js`、`routes/applications.js`、`services/companyService.js`、`utils/jobData.js` | `node --check` |
| 2026-05-09 | 增加 AI 免费次数和 VIP 工作流限制 | `routes/ai.js`、`utils/aiQuota.js`、`db/database.js` | `node --check` |
| 2026-05-09 | 标记 `/api/users/resumes` deprecated，前端保持 `/api/resumes` 主入口 | `routes/users.js`、`docs/RESUME_API_DEDUP_PLAN.md` | smoke test |
| 2026-05-09 | 记录支付三阶段上线策略，当前仅 Mock 模式验证 | `docs/PAYMENT_ROLLOUT_PLAN.md` | 文档检查 |
| 2026-05-09 | 完成 AI 响应格式分批治理，补最小 JSON schema 校验和标准错误格式 | `routes/ai.js`、`tests/smoke.test.js`、`docs/API_RESPONSE_CONVENTION.md` | `npm test` 通过，15/15 |
| 2026-05-09 | 抽取上传安全工具，头像和后台 Banner 复用 MIME 与 magic bytes 校验 | `utils/uploadSecurity.js`、`routes/upload.js`、`routes/admin.js` | `npm test` 通过，16/16 |
| 2026-05-09 | 新增后端测试 CI workflow | `.github/workflows/test.yml` | workflow 检查 |
| 2026-05-09 | 补充 P2 上传测试、AI 修改记录和数据库迁移治理方案 | `tests/smoke.test.js`、`CHANGELOG_AI.md`、`docs/DATABASE_MIGRATION_PLAN.md`、`README.md` | `npm test` 通过，18/18 |
| 2026-05-11 | 抽取后台 jobs.json 存储和分页工具，降低 `routes/admin.js` 维护成本 | `utils/adminJobsStore.js`、`utils/pagination.js`、`routes/admin.js` | `npm test` 通过，19/19 |
| 2026-05-11 | 超长 WXSS 初步整理，抽取高频颜色到全局 token 并替换首批页面硬编码 | 小程序 `app.wxss`、`pages/salary/salary.wxss`、`pages/jobs/jobs.wxss`、`pages/applications/applications.wxss` | WXSS token 引用检查 |
| 2026-05-11 | `salary.wxss` 精简第一轮，合并并删除尾部 readability 重复覆盖块 | 小程序 `pages/salary/salary.wxss` | WXSS 括号平衡检查 |
| 2026-05-11 | `salary.wxss` 精简第二轮，合并主要 kingkong polish 单 selector 覆盖块并删除重复 selector | 小程序 `pages/salary/salary.wxss` | WXSS 括号平衡检查，1480 行 |
| 2026-05-11 | `applications.wxss` 精简第一轮，合并头部、搜索、筛选、列表/FAB/弹窗部分覆盖样式 | 小程序 `pages/applications/applications.wxss` | WXSS 括号平衡检查，1163 行 |
| 2026-05-11 | `applications.wxss` 精简第二轮，合并卡片、流程、备注、Offer、表单和弹窗重复覆盖块 | 小程序 `pages/applications/applications.wxss` | WXSS 括号平衡检查，954 行，重复选择器 0 |
| 2026-05-11 | `jobs.wxss` 修复未闭合 `content` 编译错误，并合并主要尾部覆盖样式 | 小程序 `pages/jobs/jobs.wxss` | WXSS 括号平衡检查，1089 行 |
| 2026-05-11 | `index.wxss` 精简第一轮，合并首页搜索、Banner、功能宫格、列表卡片和新闻卡重复覆盖块 | 小程序 `pages/index/index.wxss` | WXSS 括号平衡检查，988 行，重复选择器 2 |
| 2026-05-11 | `experiences.wxss` 精简第一轮，合并题库页头部、Tab、筛选、统计和题目卡片重复覆盖块 | 小程序 `pages/experiences/experiences.wxss` | WXSS 括号平衡检查，980 行，重复选择器 0 |
| 2026-05-11 | `resume.wxss` 精简第一轮，合并简历诊断页 Tab、进度、按钮、空状态和 NLP 面板重复覆盖块 | 小程序 `pages/resume/resume.wxss` | WXSS 括号平衡检查，863 行，重复选择器 0 |
| 2026-05-12 | `agencies.wxss` 精简第一轮，合并机构评估页筛选、搜索、工具栏、卡片和对比条重复覆盖块 | 小程序 `pages/agencies/agencies.wxss` | WXSS 括号平衡检查，504 行，重复选择器 0 |
| 2026-05-12 | `project-builder.wxss` 精简第一轮，合并项目生成器 Hero、表单、轨道卡、芯片、按钮和结果卡重复覆盖块 | 小程序 `pages/project-builder/project-builder.wxss` | WXSS 括号平衡检查，450 行，重复选择器 0 |
| 2026-05-12 | `ai-assistant.wxss` 精简第一轮，合并 AI 助手页头部、消息气泡、快捷问题、建议和输入栏重复覆盖块 | 小程序 `pages/ai-assistant/ai-assistant.wxss` | WXSS 括号平衡检查，656 行，重复选择器 0 |
| 2026-05-12 | `profile.wxss` 精简第一轮，合并个人中心头部、统计、VIP、菜单和工作区重复覆盖块 | 小程序 `pages/profile/profile.wxss` | WXSS 括号平衡检查，355 行，重复选择器 0 |
| 2026-05-12 | `career-planner.wxss` 精简第一轮，合并职业规划页 Hero、表单、输入、提示、生成和阶段 Tab 重复覆盖块 | 小程序 `pages/career-planner/career-planner.wxss` | WXSS 括号平衡检查，474 行，重复选择器 0 |

## 进行中

| 优先级 | 任务 | 负责人 | 文件范围 | 状态 |
|---|---|---|---|---|
| P1 | 简历 API 实施迁移 | AI1 Builder | `routes/users.js`、`routes/resumes.js`、小程序简历调用 | 已完成，旧接口保留 6 个月 |
| P1 | API 响应格式分批实施 | AI1 Builder | `routes/ai.js`、小程序 `utils/api-*` | 已完成首批，支付/健康/Webhook 保持例外 |
| P2 | 上传安全工具抽取 | Codex | `utils/uploadSecurity.js`、`routes/upload.js`、`routes/admin.js` | 已完成 |
| P2 | GitHub Actions 测试 | Codex | `.github/workflows/test.yml` | 已完成 |
| P2 | README/DX 补齐 | Codex | `README.md`、`CHANGELOG_AI.md` | 已完成 |
| P2 | 数据库迁移治理方案 | Codex | `docs/DATABASE_MIGRATION_PLAN.md` | 已完成 |
| P2 | 后台管理维护成本降低 | Codex | `routes/admin.js`、`utils/adminJobsStore.js`、`utils/pagination.js` | 已完成 |
| P2 | 超长 WXSS 初步整理 | Codex | 小程序 `app.wxss`、`pages/salary/salary.wxss`、`pages/jobs/jobs.wxss`、`pages/applications/applications.wxss` | 已完成 |
| P2 | 超长 WXSS 精简清理 | Codex | 小程序 `pages/salary/salary.wxss`、`pages/applications/applications.wxss`、`pages/jobs/jobs.wxss`、`pages/index/index.wxss`、`pages/experiences/experiences.wxss`、`pages/resume/resume.wxss`、`pages/agencies/agencies.wxss`、`pages/project-builder/project-builder.wxss`、`pages/ai-assistant/ai-assistant.wxss`、`pages/profile/profile.wxss`、`pages/career-planner/career-planner.wxss` | 已完成首批 |

## 当前文件占用

| 负责人 | 文件 | 任务 | 状态 |
|---|---|---|---|
| Codex | 小程序普通页面 AI 提示、`utils/favorites.js`、职位列表/详情与提醒回归测试 | 移除非 AI 专属页面的顶部 AI 说明；职位收藏不再弹设置对话框，并按岗位截止日或默认 30 天自动开启提前 3 天和 1 天提醒 | 已完成；118/118 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | `routes/ai.js`、职业规划生成服务、小程序 `package-career/pages/career-planner/*`、测试与文档 | 将 AI 求职规划从关键词清单升级为包含技能标准、项目证据、阶段交付物、量化指标、每周节奏和风险应对的可执行方案 | 已完成；115/115 tests、小程序检查、微信预览、真实模型质量门禁与生产部署健康检查通过 |
| Codex | 小程序 `package-user/pages/profile-edit/*`、导航回归测试 | 压缩编辑资料页多选项的继续搜索入口并移至卡片右上角；毕业年份改为宽范围年份选择器 | 已完成；导航回归、全量测试、小程序检查和微信预览编译通过 |
| Codex | 小程序 `pages/resources/*`、`package-career/pages/career-planner/*`、导航回归测试 | 将隐藏的职业工具中心缺失功能并入资源中心，补充 AI 求职规划、Offer 对比和简历中心入口，并将规划页收口为单一功能页 | 已完成；导航回归、全量测试、小程序检查和微信预览编译通过 |
| Codex | `miniprogram/package-career/pages/resume/resume.wxml`、`resume.wxss`、页面回归测试 | 隐藏“我的简历”页面滚动条，并合并基本信息与个人优势卡片 | 已完成；页面回归、小程序检查和微信预览编译通过 |
| Codex | `services/v4AiRuntime.js`、`services/v4ResumeCenter.js`、`miniprogram/package-career/pages/resume-center/*`、`tests/`、`DEVELOPMENT_STATUS.md` | 修复 AI 简历润色误走 fallback、原文与建议相同及敏感/无意义字段被推荐的问题 | 已完成；109/109 tests、发布检查和生产 AI 实测通过 |
| Codex | `miniprogram/custom-tab-bar/index.js`、`miniprogram/app.json`、两张灰色 Tab 图标与导航测试 | 区分“进度”“AI专家”的选中/未选中图标颜色，未选中统一灰色 | 已完成；导航测试与小程序检查通过 |
| Codex | UGC 数据表、面经/评论/回复/机构评价接口、管理后台审核页、隐私政策及审核测试文档 | 建立发布前人工审核、公开内容过滤、统计联动和审核日志；同步虚拟支付与公司主体隐私披露 | 已完成；105/105 tests、发布检查与微信预览通过 |
| Codex | `miniprogram/components/c-login-popup`、`miniprogram/behaviors/login-gate.js`、所有登录受限入口及登录回归测试 | 将未登录点击统一改为当前页登录弹层，登录成功后继续原操作；登录弹层替换职引品牌 Logo | 已完成；101/101 tests、发布检查与微信预览编译通过 |
| Codex | `miniprogram/package-ai/pages/daily-brief/*`、导航回归测试 | 移除求职日报旧绿色问候头部，按首页蓝白求职计划卡片重构概览、统计与内容模块；移除 AI 返回的单字“伪图标” | 已完成；98/98 tests、发布检查与微信预览编译通过 |
| Codex | `miniprogram/utils/resume-versions.js`、`miniprogram/package-ai/utils/resume-versions.js`、AI 助手/JD 匹配引用与导航测试 | 将仅供 AI 分包使用的简历版本工具迁出主包，修复微信代码质量“主包未使用 JS”提示 | 已完成；97/97 tests、发布检查与微信预览编译通过，主包减少约 3 KB |
| Codex | `utils/featureFlags.js`、管理后台功能开关/Banner 页面、小程序首页与功能开关客户端、测试 | 增加“首页推荐岗位”独立审核开关并默认隐藏；校正 Banner 展示比例和上传尺寸提示 | 已完成；95/95 tests、生产开关关闭、公网验证通过、微信开发版 4.0.2 已上传 |
| Codex | 生产服务器、`miniprogram/utils/app-config.js`、Agent 配置测试与运维文档 | 将正确 4.0 主项目部署到 4400，完成 V4 数据迁移、虚拟支付与 Nginx 收口，并启用小程序 V4 Agent | 已完成；公网 readiness/V4/职位/校招/支付/鉴权冒烟通过 |
| Codex | `AGENTS.md`、`DEVELOPMENT_STATUS.md`、`docs/`、运行检查脚本、薪资可信度相关文件、首页与 TabBar、测试 | 收口误用副本，确认桌面仓库为唯一 4.0 主项目，迁移有效上线能力并完成发布验证 | 已完成；93/93 tests、发布检查与微信预览通过 |
| Codex | 小程序 `pages/resources`、资源页测试与文档 | 按参考图重做自定义导航、校招主视觉和横向资源卡片 | 已完成；91/91 tests、发布检查通过 |
| Codex | 小程序 `pages/index`、`pages/resources`、`components/home-campus-updates`、校招排序测试与文档 | 首页校招改为每个岗位独占一行并按每日最新更新时间排序；重构资源中心 UI | 已完成；91/91 tests、发布检查通过 |
| Codex | 小程序 `pages/resources`、`pages/index`、`components/home-campus-updates`、`custom-tab-bar`、导航调用及相关测试/文档 | 将校招 Tab 改为资源中心，首页求职情报改为校招瀑布流 | 已完成；91/91 tests、发布检查通过 |
| Codex | `README.md` | 补充开发说明 | 已完成 |
| Codex | `AGENTS.md` | 建立协作规则 | 已完成 |
| Codex | `DEVELOPMENT_STATUS.md` | 建立状态记录 | 已完成 |
| Codex | `tests/smoke.test.js` | 扩展后端 smoke tests | 已完成 |
| Codex | 小程序 `messages`、`feedback`、`news` 页面与 `utils/api-*` | 统一请求迁移 | 已完成 |
| Codex | `docs/RESUME_API_DEDUP_PLAN.md` | 简历 API 去重方案 | 已完成 |
| Codex | `docs/API_RESPONSE_CONVENTION.md` | API 响应格式规范 | 已完成 |
| Codex | 职位本地数据源相关后端文件 | 删除 SQLite `jobs` 双轨读取 | 已完成 |
| Codex | AI 配额相关后端文件 | 助手/规划/工作流权限限制 | 已完成 |
| Codex | `routes/ai.js`、`tests/smoke.test.js` | AI schema 与错误格式首批治理 | 已完成 |
| Codex | `utils/uploadSecurity.js`、`routes/upload.js`、`routes/admin.js` | 上传安全工具抽取 | 已完成 |
| Codex | `.github/workflows/test.yml` | 后端测试 CI | 已完成 |
| Codex | `README.md`、`CHANGELOG_AI.md`、`docs/DATABASE_MIGRATION_PLAN.md`、`tests/smoke.test.js` | P2 文档和上传测试补齐 | 已完成 |
| Codex | `routes/admin.js`、`utils/adminJobsStore.js`、`utils/pagination.js`、`tests/smoke.test.js` | 后台 jobs 存储和分页工具抽取 | 已完成 |
| Codex | 小程序 `app.wxss`、`pages/salary/salary.wxss`、`pages/jobs/jobs.wxss`、`pages/applications/applications.wxss` | 超长 WXSS 首批 token 化整理 | 已完成 |
| Codex | 小程序 `pages/salary/salary.wxss`、`pages/applications/applications.wxss`、`pages/jobs/jobs.wxss`、`pages/index/index.wxss`、`pages/experiences/experiences.wxss`、`pages/resume/resume.wxss`、`pages/agencies/agencies.wxss`、`pages/project-builder/project-builder.wxss`、`pages/ai-assistant/ai-assistant.wxss`、`pages/profile/profile.wxss`、`pages/career-planner/career-planner.wxss` | 超长 WXSS 重复覆盖块清理 | 已完成首批 |
| Codex | `utils/featureFlags.js`、`routes/features.js`、`server.js`、`.env.example`、`tests/smoke.test.js`、小程序全局配置/导航及职位相关页面 | 职位功能全局开关 | 已完成，40/40 smoke tests 与小程序检查通过 |
| Codex | `db/v4Schema.js`、`services/v4JobMatch.js`、`services/v4Profile.js`、`routes/v4/`、`server.js`、`tests/smoke.test.js`、`docs/V4_SPRINT1_BACKEND.md` | V4 Sprint 1 后端基座：画像、岗位匹配、申请状态历史 | 已完成，58/58 tests 通过 |
| Codex | `db/v4Schema.js`、`services/v4Sponsor.js`、`services/v4JobMatch.js`、`routes/v4/jobs.js`、`routes/v4/applications.js`、`tests/smoke.test.js`、`docs/V4_SPRINT1_BACKEND.md` | V4 第一优先级完善：Sponsor、资格匹配、CRM 看板与详情 | 已完成，60/60 tests 通过 |
| Codex | `db/v4Schema.js`、`routes/v4-admin.js`、`routes/v4/jobs.js`、`services/v4JobMatchStore.js`、`scripts/migrate_v4.js`、`package.json`、`server.js`、`tests/smoke.test.js` | V4 第一优先级收尾：Sponsor 核验审计、批量匹配、V3 迁移 | 已完成；正式迁移及二次 dry-run 成功，pending=0；迁移后 63/63 tests 通过 |
| Codex | 小程序 `utils/api-v4.js`、`package-user/pages/profile-edit`、`job-detail`、`applications` | V4 小程序首批接入：画像完整度、Sponsor 情报、三维匹配、云端 CRM 状态机 | 已完成；`check:miniprogram` 与 63/63 tests 通过 |
| Codex | 小程序 `pages/jobs`、`package-user/pages/application-detail`、`applications`、`app.json`，后台 `admin/sponsor-profiles.html`、`admin/js/common.js` | V4 小程序第二批：Sponsor 筛选、云端匹配、申请详情协作、后台 Sponsor 审核 | 已完成；`check:miniprogram`、63/63 tests、迁移 dry-run 通过；`check:data` 仅命中既有 `api-feishu-content.js` 乱码问题 |
| Codex | `routes/v4/jobs.js`、`routes/v4/applications.js`、`tests/smoke.test.js`、小程序 `pages/jobs`、`package-user/pages/application-detail`、`utils/api-feishu-content.js` | V4 第三批发布收尾：筛选一致性、详情状态流转、内容检查清零 | 已完成；`check:release` 通过、63/63 tests、内容错误 0、迁移 pending=0 |
| Codex | 微信开发者工具与 `scripts/acceptance-bot.js` 验收链路 | V4 联调阶段：开发者工具 E2E 与无 GUI 验收 | E2E 预检 4/4；安全验收 29/29；真实 E2E 已完成 10/11 场景，面试空间 mock 路由问题已修复 |
| Codex | `scripts/e2e-3.0-bot.js`、微信开发者工具自动化报告 | V4 真实 E2E 兼容修复与重跑 | 待最终复验；微信开发者工具重启后提示 `access_token missing`，需重新登录后执行完整 11 场景回归 |

## 待决策

| 事项 | 决策人 | 说明 |
|---|---|---|
| 真实微信支付上线 | Human | 当前仅 Mock 模式验证流程，有营业执照和商户资质后再进入真实支付灰度。 |

## 验证命令

```bash
npm test
```

当前测试覆盖：

- `/api/health`
- `/api/jobs`
- `/api/banners`
- `/api/companies`
- `/api/applications` 匿名拒绝
- `/api/payment/orders` 匿名拒绝
- `/api/users/web-register` 密码哈希
- `/api/users/web-login`
- `/api/users/resumes` deprecated 标记
- `/api/ai/workflow` VIP 拒绝
- `/api/ai/chat` 参数错误标准响应
- `/api/ai/project-builder` 参数错误标准响应
- `/admin/api/upload/banner` 伪 MIME 拒绝
- `/admin/api/upload/banner` 非图片 MIME 拒绝
- `/admin/api/jobs` 读取 jobs.json 列表
- `/api/upload/avatar` 正常 PNG 上传
- `/api/payment/create-order` Mock 下单
- `/api/payment/mock-confirm`
- `/api/payment/verify/:orderNo`
- `/api/upload/avatar` 伪 MIME 拒绝
- `/webhook/deploy` 缺签名拒绝

## Sprint 2 开发占用（2026-07-14）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `db/v4Schema.js`、`routes/v4/resumes.js`、`routes/v4/materials.js`、`services/v4ResumeCenter.js`、`utils/aiQuota.js`、`tests/smoke.test.js`、小程序简历与申请材料中心 | Sprint 2 申请材料中心：经历库、简历版本、AI 修改确认、AI 申请助手与额度控制 | 已完成，65/65 tests 与小程序检查通过 |

## Sprint 2 完成记录（2026-07-14）

| 事项 | 文件 | 验证 |
|---|---|---|
| 经历库、五类简历、复制/重命名/归档/默认、岗位与申请关联、版本对比恢复 | `db/v4Schema.js`、`services/v4ResumeCenter.js`、`routes/v4/resumes.js` | 自动化回归通过 |
| AI 逐条确认、手动编辑、防直接覆盖、防虚构、模型/提示词留痕、额度统计 | `routes/v4/resumes.js`、`utils/aiQuota.js` | 自动化回归通过 |
| JD 定制简历、Cover Letter、Recruiter 消息、Follow-up 邮件及确认保存 | `routes/v4/materials.js`、小程序 `application-materials` | 自动化回归与小程序检查通过 |
| AI 简历中心页面与完整开发说明 | 小程序 `resume-center`、`docs/V4_SPRINT2_APPLICATION_MATERIALS.md` | 页面注册检查通过 |

## Sprint 4 开发占用（2026-07-14）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `db/v4Schema.js`、`routes/v4/interviews.js`、`routes/v4/agents.js`、`routes/v4/membership.js`、相关 services/scripts/admin/miniprogram/tests/docs | Sprint 4 面试闭环、统一 AI、埋点看板、会员商业化与上线工程 | 已完成，69/69 tests 与发布检查通过 |

## Sprint 4 完成记录（2026-07-14）

| 事项 | 验证 |
|---|---|
| 岗位面试空间自动创建、模拟/STAR 训练、四维评分、报告、趋势和 Today 任务 | 自动化闭环通过 |
| 四 Agent、上下文读取、历史、超时降级、重试、取消、敏感信息脱敏、写操作确认 | 自动化状态机通过 |
| 全链路标准事件、7 日留存、申请漏斗、AI 使用率和后台运营看板 | 管理接口测试通过 |
| 会员方案、AI/简历/面试配额、高级匹配、订阅到期降级、订单退款状态 | 权益接口测试通过；真实支付双开关保持关闭 |
| 正式迁移、回滚 dry-run、功能开关、API 文档、小程序检查、灰度与错误监控 | `pending=0`，回滚计划可生成，灰度 0%，错误 0 |
| 性能采样 | 用户主链路未发现慢请求；测试中的内部提醒派发为 1.0–1.5 秒，已纳入看板持续观察 |
## 首页信息架构优化占用（2026-07-16）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `miniprogram/pages/index`、`miniprogram/pages/applications`、`miniprogram/pages/ai-career`、`miniprogram/custom-tab-bar`、`routes/v4/today.js` | 完成首页工作台、Today 同步与 V4 五项一级导航 | 已完成；79/79 tests、小程序检查通过；真实 E2E 待复验 |
