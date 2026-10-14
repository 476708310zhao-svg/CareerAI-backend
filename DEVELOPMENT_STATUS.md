# DEVELOPMENT_STATUS

更新时间：2026-10-14

主项目目录：以 `git rev-parse --show-toplevel` 的结果为准。

小程序源码目录：仓库根目录下的 `miniprogram/`。

禁止在个人机器旧副本、Junction 别名或仓库外复制目录中开发、预览、部署或提交。

## 当前批次

### 2026-10-14 上线 P0/P1 修复与待验收项

- [x] 修复生产 HTTPS Nginx 的 `/api/` 路由，保留官网转发；公开 `/api/health/ready`、`/api/features`、`/api/campus` 返回 JSON 200，空参数登录请求返回预期 JSON 400。原配置已在服务器同目录备份，`nginx -t` 及 reload 成功。
- [x] 生产 `.env` 使用现有服务端校验器只读验证通过（未读取或展示密钥值）；AI 可用，ASR、短信和微信订阅模板仍未配置，应保持相关能力降级。
- [x] 发布脚本改为隔离快照预检、只读生产迁移状态门禁、候选/正式 PM2 进程身份验证与失败回滚；备份必须验证 SQLite、运行环境及 Nginx 配置，失败不生成成功标记；CI 执行发布门禁及 Acceptance。
- [x] 当前小程序首页/AI/导航的 P1 文案、触控目标、可访问语义、辅助文字对比度、缓存时效及会员失败关闭已修复；业务路由保持不变。
- [x] 本地最终 `check:release`：360 通过、1 个仅限 Linux 的测试跳过；Acceptance 30/30；差异无空白错误。
- [ ] 微信开发者工具自动化已确认 390×844 视口并导航到资源页，但截图调用在 30 秒及 60 秒两次超时，未取得可比对新图；真机登录验收也仍待完成。扩充后的首页内容与旧基准图冲突，不能将旧图的差异报告当作新方案通过。
- [ ] 生产数据库只读迁移检查发现跟踪表不存在，当前线上代码报告 `0001–0006` 共 6 项待迁移；应用部署被新门禁阻止。Linux 实际备份/候选切流、微信后台审核配置也未完成；本批未执行数据库迁移或应用代码部署。

### 2026-10-10 已确认浅色原型正式落地（已完成）

- Codex 当前占用：`design-system/zhiyin-career/MASTER.md`、`miniprogram/app.wxss`、`miniprogram/custom-tab-bar/*`、五个一级页面、`miniprogram/components/c-job-card/*`、`miniprogram/package-ai/pages/ai-assistant/*`、`miniprogram/pages/profile/profile.js`、`miniprogram/pages/jobs/jobs.js` 与相关视觉/导航测试。
- 目标：严格按照 Human 已确认的六张蓝白浅色原型落地，移除大面积深色色块、英文装饰标题和遮挡 Tab 的 AI 入口；不改接口、登录、状态机或数据库。
- 状态：五个一级页面、悬浮 TabBar 与上下文 AI 已按确认原型完成正式代码落地；340/340 全量测试、30/30 Acceptance、AI 质量、数据内容、小程序静态与包体检查通过，主数据库 SHA-256 保持 `B221AD658D1B24AECAB2F8C1E43F2749C44F979EF703DE35D92283A491C69D4B`。微信开发者工具内视觉编译仍待 Human 点击执行。

### 2026-10-10 五 Tab 与上下文 AI 信息架构重构（已完成）

- Codex 当前占用：`miniprogram/app.wxss`、`miniprogram/custom-tab-bar/*`、`miniprogram/pages/index/*`、`pages/jobs/*`、`pages/applications/*`、`pages/resources/*`、`pages/profile/*`、`miniprogram/package-ai/pages/ai-assistant/*`、相关视觉/导航回归测试与 `design-system/zhiyin-career/`。
- 目标：保留已交付业务逻辑和数据隔离，重构为统一的高级、简洁、直接的移动端工作台。
- 状态：五个一级页面、悬浮 TabBar 与上下文 AI 已完成结构和视觉重构，提交 `0516208`；340/340 全量测试、30/30 Acceptance、AI 质量、数据内容、小程序静态与包体检查通过，主数据库指纹未变化。微信开发者工具服务端口关闭，CLI 无法代替界面执行编译，保留一次开发者工具内人工视觉验收。

### 2026-10-10 功能简化与 AI 编排 checkpoint 交付候选

- Integration 0 已建立工作区拆分、数据库保护和原子提交边界。
- Checkpoint 1–9 已形成独立提交，Checkpoint 10 开始前的已提交运行代码基线为 `2fad29d14013dc813f11f5e5738c0095091e7c15`；Checkpoint 10 文档候选的自动化门禁已通过，本记录随本次文档提交生效，提交哈希以 Git 历史为准。
- 当前小程序一级导航固定为：首页、找岗位、进度、资源中心、我的。首页聚焦单一主行动；资源中心承担内容资产，“我的”承担个人资产，不再展示旧四 Agent 选择器或旧简历主入口。
- 申请工作台、持久上下文 AI、移动申请、简历版本、申请材料和面试空间已按账号/申请隔离；AI 写入和跨对象影响保持预览、确认及幂等保护。
- 2026-10-10 11:39（Asia/Shanghai）候选 tree `abdaccf0cdecccda635440546d039e48f88916c9` 完成自动化门禁；该值是文档候选的 Git tree 证据，不是 branch commit。`npm test` 318/318、`check:acceptance` 30/30、`check:miniprogram` 通过（媒体 192.3 KB，主包 0.99 MB）；`check:e2e-3.0` 4/4 仅为 dry-run 预检。Migration `0001–0011`连续性、五 Tab、6 个 feature 默认值、Checkpoint 9 组件清理、材料工具路径与其他静态一致性检查通过；主数据库指纹未变，未执行 migration apply。
- 未完成/未授权：微信开发者工具完整主链路、真机 E2E、真实支付与测评资料商业化、生产部署、远端同步。
- 功能开关以代码和环境显式配置为准；`utils/featureFlags.js` 的所有已登记开关代码默认值均为 `false`。
- 工作区中的业务预制 diff、设计审计、截图/日志、零引用资源图、API 巡检和未完成依赖不属于已交付 checkpoint，详见 `docs/FINAL_DELIVERY_RECORD_20261010.md`。

### 2026-10-10 小程序质量与登录 404 修复

- [x] 移除职位页已经没有渲染使用的 `empty-state` 注册及四个组件文件，解决微信开发者工具“无使用或无依赖文件”告警。
- [x] 确认本地服务端挂载 `/api/users/login` 和 `/api/users/phone-login`，前端路径与代码契约一致。
- [x] 复现生产 `https://api.zhiyincareer.com/api/health` 与登录接口均被 Next.js 官网接管并返回 HTML 404，确认为线上 Nginx/API 路由冲突，不是微信 `code` 失效。
- [x] 小程序将误路由的 HTML 404 转换为“登录服务暂不可用”，不再直接展示 `HTTP 404`。
- [x] 仓库 `nginx.conf` 增加 `location ^~ /api/` 优先代理到 `127.0.0.1:4400`，避免同机官网路由抢占 API。
- [x] 专项 19/19、全量 338/338、Acceptance 30/30、AI 质量 7/7、`check:miniprogram` 与数据内容检查通过；主数据库 SHA-256 仍为 `B221AD658D1B24AECAB2F8C1E43F2749C44F979EF703DE35D92283A491C69D4B`。
- [x] 2026-10-14 已在服务器修复并重载活动 Nginx 站点配置，公开 `/api/health/ready` 恢复 JSON 200；真实微信授权登录仍需开发者工具/真机确认。
- [ ] 微信开发者工具重新扫描、登录真机验收、五个一级页面的产品结构视觉验收待 Human 执行。

事实层级固定为：已提交的运行代码/schema 与最终门禁输出是事实依据；`docs/FINAL_DELIVERY_RECORD_20261010.md` 是交付摘要；正式 PRD 表达产品意图；Integration manifest 记录 checkpoint 拆分历史。以下内容是历史快照，只用于追溯，不能覆盖上述事实依据。

2026-09-23 正式 API HTTPS 证书故障已恢复：`api.zhiyincareer.com` 的 Let's Encrypt 证书于 2026-09-20 17:23（北京时间）过期，导致微信开发者工具报 `ERR_CERT_DATE_INVALID`，请求未进入应用。已续签并由宝塔 Nginx 重新加载，新证书有效至 2026-12-22 07:56（北京时间）。生产 `/api/health`、`/api/health/ready` 均为 200，未登录访问 `/api/v4/applications/board` 返回预期 401，证明 TLS 与路由正常。服务器原来缺少 certbot timer/cron，现已安装 `/etc/cron.d/certbot-jobapp` 每日两次自动续期，`crond` active；Let's Encrypt staging 模拟续期及 Nginx reload hook 全部成功。未修改小程序代码或业务数据。

2026-09-20 Web P0：补齐 AI 会话恢复/历史/取消/切换隔离，小程序一次性电脑登录码、Web 手动新增申请、PDF 导入与在线简历版本编辑、任务新增/编辑/完成、面试日期及联系人，资源入口接真实工作区。Web 4/4（隔离 API 17/17），原工作台与 P0 Edge 浏览器验收通过；全量临时数据库发布检查 250/250、AI 7/7、小程序检查和数据检查错误 0。此前后台登录 401/429 在隔离数据中未复现。尚未真机双端验收、真实模型联调或生产部署；移动端 AI 历史迁移仍属 P1。


2026-09-20 “我的”按用户要求去重：移除资源中心已有的简历、JD、申请材料、模拟面试、每日简报、错题本、使用指南等入口及求职资产区；会员仅保留顶部入口，收藏和消息各保留一次，我的面经保留个人发布管理。账号服务收敛为反馈、关于、设置三行，删除失去用途的资产统计与远端加载。相关测试 45/45、`check:miniprogram`、定向 `git diff --check` 通过；浏览器静态排版覆盖四种屏宽与未登录/普通/会员状态，无横向溢出，尚未微信真机验收或发布。

2026-09-20 资源中心压缩为分类切换布局：四个求职阶段与“更多工具”一次展示一组，最多 6 个双列工具卡；AI 专家和专项咨询保持顶部，内容与服务改为一行四个入口。所有原有工具及带参数路由保留，切换后返回页面保留当前分类。专项测试 45/45、`check:miniprogram` 通过；使用真实页面数据和 WXSS 的浏览器静态排版检查覆盖 320/375/390/430 宽度与全部 5 个分类，约 1～1.22 屏，无横向溢出或标题裁切。静态预览不替代微信真机验收；未部署。

2026-09-18 按用户提供的旧版截图恢复“我的”页结构：保留求职资产卡、8 个求职工具（收藏、简历、模拟面试、每日简报、材料库、错题本、笔经面经等）和 5 个其他服务入口（反馈、指南、关于、会员权益、设置）。保留当前申请管线 Tab 路由修正和资源中心 Tab，不恢复独立 AI 专家 Tab。新增旧版模块回归断言，定向测试 44/44、`check:miniprogram` 通过，未进行真机验收。

2026-09-18 资源中心视觉层级优化：四个求职阶段使用更清晰的分段导航；每个主阶段的第一项作为主操作横跨整行；增加阶段提示语和更大的可点击卡片；低频“职业决策”改为“更多工具”，避免与主流程竞争；AI 专家入口保持在顶部。定向测试 43/43、`check:miniprogram` 通过，未进行微信真机验收。

2026-09-16 资源中心恢复为第 4 个 Tab，导航顺序为：首页、找岗位、进度、资源中心、我的。资源中心按“明确方向、准备简历、匹配投递、面试准备”四个流程组织工具，顶部提供 AI 专家统一入口；校招日历、AI 网申助手、JD 匹配、简历优化、模拟面试、面试复盘等均保留直接入口。首页恢复岗位、校招、AI 面试三个 Banner 轮播，后台数量不足时自动补齐。新增资源中心路由、工具去重和注册页测试；全量 237/237、`check:miniprogram` 通过，未部署、未进行微信真机验收。

2026-09-16 小程序申请详情可靠性收尾：增加加载失败重试；刷新保留未保存跟进草稿；仅 PATCH 修改字段，避免回写旧日期/长备注；保存防重、失败保留内容、保存期间继续编辑不丢失；可清除日期；状态更新携带服务端版本，冲突刷新并保留草稿；异步请求期间账号变化清空旧数据。“更新下一步”使用卡片选择器定位。新增 5 项行为测试，全量 234/234、`check:release` 通过；申请详情和面试空间标签嵌套检查通过，未做微信真机验收。

2026-09-15 职引 5.0 P0 首页与申请详情继续收敛：首页移除会员权益横幅，运营 Banner 仅保留岗位/校招相关内容，按用户反馈撤回重复新增的“今日待办”列表，保留原有“今日求职计划”卡；申请详情将下一步行动、截止日期、面试日期和短备注压缩为“下一步跟进”轻量卡片。专项 45/45、全量 229/229、`check:release` 通过，未运行真实微信 E2E。

2026-09-15 UI/UX 第二阶段已完成：申请详情按上下文提供单一“建议下一步”主操作；AI 面试报告可将复盘加入当前申请任务，并将相册导出明确命名为“保存图片”。已补充静态回归断言，未运行真实微信 E2E，未提交或部署。

Sprint 8“提醒可靠性、跨设备一致性与收藏请求统一”已完成代码和自动化验证。提醒使用唯一投递键、租约、失败重试、有界并发和结构化耗时；Today 改为跨设备增量合并并拒绝旧状态覆盖；收藏增加幂等 outbox、删除 tombstone，并统一进入小程序请求层。竞争力陪跑已补充响应完整性校验；收藏同步已兼容 iOS 对 SQLite 空格日期格式的限制。真实双设备/微信订阅消息 staging、生产 migration 和上线仍待 Human；未运行真实 E2E、未调用真实 AI、未部署。

## 已完成

| 日期 | 事项 | 文件 | 验证 |
|---|---|---|---|
| 2026-09-14 | 第四批功能收敛：将 AI 求职规划、竞争力陪跑和每日简报明确为同一计划的生成、诊断和执行视图，增加互相带上下文的入口说明，避免用户维护多套计划 | `miniprogram/package-career/pages/career-planner/career-planner.js`、`career-planner.wxml`、`career-planner.wxss`、`miniprogram/package-career/pages/career-coach/career-coach.js`、`career-coach.wxml`、`career-coach.wxss`、`tests/navigationConfig.test.js` | 全量 207/207、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 第三批功能收敛：申请详情新增 JD 匹配入口；匹配前自动写入当前岗位快照，用户可从申请上下文重新匹配，补齐岗位、简历、匹配和材料的申请包闭环 | `miniprogram/package-user/pages/application-detail/application-detail.js`、`application-detail.wxml`、`application-detail.wxss`、`tests/navigationConfig.test.js` | 全量 206/206、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 第二批功能收敛：申请详情新增“申请包”区域，提供关联简历与申请材料的上下文入口；申请材料页支持携带 `applicationId` 打开并自动选中对应申请，避免用户重新寻找岗位和申请记录 | `miniprogram/package-user/pages/application-detail/application-detail.js`、`application-detail.wxml`、`application-detail.wxss`、`miniprogram/package-ai/pages/application-materials/application-materials.js`、`application-materials.wxml`、`application-materials.wxss`、`tests/navigationConfig.test.js` | 全量 206/206、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 第一批功能收敛：将首页、个人中心、每日任务和使用指南中的旧“投递追踪/求职进度”入口统一指向主 Tab“申请管线”；旧页面默认兼容跳回主 Tab，仅本地记录详情保留兼容参数，暂不删除业务能力 | `miniprogram/pages/index/index.js`、`miniprogram/pages/profile/profile.js`、`miniprogram/utils/daily-tasks.js`、`miniprogram/package-user/pages/usage-guide/usage-guide.js`、`miniprogram/pages/applications/applications.js`、`miniprogram/package-user/pages/job-progress/job-progress.js`、`tests/navigationConfig.test.js` | 全量 205/205、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 按用户纠正恢复资源中心原有完整展示，撤回隐藏/展开交互；本轮转为评估功能本身的重叠与必要性，未执行功能合并或删除 | `miniprogram/pages/resources/resources.js`、`resources.wxml`、`resources.wxss` | 三个资源页文件已恢复至本轮修改前版本 |
| 2026-09-14 | 继续收口首页入口：移除与资源、进度和 AI 专家 Tab 重复的“核心求职工具”区，首页聚焦今日任务、运营信息和校招更新 | `miniprogram/pages/index/index.wxml`、`index.js` | `check:miniprogram`、导航回归通过 |
| 2026-09-11 | 精简个人中心信息架构：移除与资源中心重复的我的简历、模拟面试、笔经面经和使用指南入口；收藏、投递、面试记录继续从统计卡进入，快捷区收敛为消息、每日简报、申请材料和错题本 | `miniprogram/pages/profile/profile.wxml`、`profile.wxss` | `check:miniprogram`、导航回归 14/14 通过 |
| 2026-09-10 | 修复竞争力陪跑分包页面在 `lazyCodeLoading: requiredComponents` 下偶发将 AI 说明组件解析为 `wx://not-found`；页面改为显式声明主包组件依赖，并增加配置回归断言 | `miniprogram/package-career/pages/career-coach/career-coach.json`、`tests/sprint4CareerCoach.test.js` | Sprint 4 专项 6/6、全量 204/204、`check:release` 与微信官方 CLI preview 编译通过 |
| 2026-09-10 | 修复收藏同步将 SQLite UTC 时间直接传入 `new Date()` 导致部分 iOS 无法解析的警告；改为逐字段 UTC 解析，并兼容 ISO、日期和数字时间戳 | `miniprogram/utils/date-time.js`、`miniprogram/utils/favorites.js`、`tests/sprint8Reliability.test.js` | Sprint 8 专项 7/7、全量 204/204、`check:release` 通过；未运行真实 E2E |
| 2026-09-09 | 修复竞争力陪跑在 401、超时、网络错误、HTTP 错误或残缺响应下仍进入成功视图，造成分数、七维诊断、周报和计划全部空白的问题；登录失效改为重新登录，其余异常展示可重试错误 | `career-coach.js`、`career-coach-state.js`、`tests/sprint4CareerCoach.test.js` | Sprint 4 专项 6/6、全量 203/203、`check:release` 通过；未运行真实 E2E，生产后端仍需独立发布 |
| 2026-09-09 | Sprint 8：提醒派发增加唯一投递账本、租约、失败重试、有界并发、游标续跑和耗时埋点；Today 改为跨设备增量合并与更新时间冲突控制；收藏增加 outbox、操作回执、删除 tombstone 并迁入统一 API 客户端 | `routes/notify.js`、`scripts/dispatch_reminders.js`、Today 服务/首页、收藏路由与工具、`0006_sprint8_reliability.sql`、`tests/sprint8Reliability.test.js`、Sprint 8 文档 | 专项 6/6、Smoke 72/72、全量 202/202、小程序检查与 `git diff --check` 通过；真实微信请求 0，未运行真实 E2E，生产 migration 待 Human |
| 2026-09-08 | Sprint 7：定义 Free/Pro 与 JD 简历包、7 天面试冲刺包、秋招季度包；保持历史 planId 0～3 兼容；建立订单/支付/权益/额度/退款统一账本、权益 Grant、退款审批状态机、六类告警和 0% 商业灰度审批门禁；会员页增加场景包边界、权益/订单/退款入口 | `services/v4Commerce*.js`、支付/会员/管理路由、商业化 migration、小程序会员页、`tests/sprint7Commerce.test.js`、`docs/V4_SPRINT7_COMMERCE_GOVERNANCE.md` | Sprint 7 专项 4/4、migration 5/5、Smoke 71/71、全量 195/195、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-08 | Sprint 6：新增 OA 计划/计时/错题/能力统计；将旧项目生成页升级为真实岗位差距驱动的证据项目、四里程碑留证、完成证据和确认式经历库写入；岗位详情增加五项证据 Job Trust Score 与本人官网核验记录 | OA/Project/Job Trust V4 数据表、服务、路由和小程序页面，`tests/sprint6Copilots.test.js`、`docs/V4_SPRINT6_OA_PROJECTS_JOB_TRUST.md` | Sprint 6 专项 7/7、migration 5/5、全量 190/190、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-08 | Sprint 5：新增联系人 CRM、Connect Note/Cold Message/Coffee Chat/Follow-up/Referral Request 五类可编辑草稿、用户确认外部发送、跟进 Today 提醒和 Networking 真实漏斗；Referral 成功关联岗位、正式申请、简历及版本 | `services/v4Networking.js`、Networking V4 路由、新增 Networking migration、Today/竞争力关联、小程序 Networking Copilot、`tests/sprint5Networking.test.js`、`docs/V4_SPRINT5_NETWORKING_COPILOT.md` | Sprint 5 专项 5/5、migration 5/5、全量 182/182、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-08 | Sprint 4：新增七维 Career Competitiveness Score、证据/差距/行动入口、真实漏斗驱动的 3/6/12 月计划与周报告；每日幂等生成 3～5 个 Today 任务，支持完成、延期、跨设备同步和站内提醒 | `services/v4CareerCoach.js`、Career/Today 路由、新增诊断与周报 migration、小程序竞争力陪跑页、`tests/sprint4CareerCoach.test.js`、`docs/V4_SPRINT4_CAREER_COACH.md` | Sprint 4 专项 5/5、migration 5/5、全量 176/176、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-04 | Sprint 3：完成可行动岗位梯次与投递决策、Sponsor/身份限制说明；接通岗位 JD 到真实简历版本的逐条确认和不可变新版本；新增公司×岗位×轮次 Interview Brief、弱项专项复练及 Today/申请进度回写 | Job Match、V4 简历中心、面试服务，小程序岗位详情/简历中心/面试空间，`tests/sprint3AiLoops.test.js`、`docs/V4_SPRINT3_HIGH_VALUE_AI_LOOPS.md` | Sprint 3 专项 5/5、全量 170/170、`check:release` 通过；AI 质量矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-04 | Sprint 2.5：建立 `schema_migrations`、顺序 SQL migration、SHA-256 漂移检测、baseline 结构前置检查与显式目标/备份/确认保护；在隔离副本验证备份、迁移、幂等、故障事务、恢复和回滚 | `db/migrate.js`、`db/backup.js`、`db/migrations/0001_current_schema_baseline.sql`、迁移/演练脚本、专项测试、`docs/DATABASE_MIGRATION_PLAN.md` | migration 专项 5/5、全量 165/165；隔离演练 8 项检查通过，11,182,080-byte 备份恢复 SHA-256 一致，生产写入 0；未运行真实 E2E |
| 2026-09-04 | Sprint 2.4：建立 11 个合成匿名 AI 样本和超时/429/5xx/断网/非法 JSON/配置缺失/kill switch 故障矩阵；增加递归 PII 脱敏、虚构执行拦截、确认写入和额度不多扣；记录耗时、Token、降级与可选成本并汇总到运营看板 | AI runtime/Agent/简历/文案/面试路由与服务、`utils/aiSafety.js`、匿名 fixtures/门禁辅助程序、质量脚本/测试、`docs/AI_QUALITY_GATE.md` | `check:release` 160/160 通过、AI 故障矩阵 7/7、媒体 191.2 KB、Errors 0/Warnings 4；外部请求 0，未运行真实 E2E |
| 2026-09-04 | Sprint 2.3：建立岗位查看、匹配、简历确认、加入看板、确认投递、进入面试、收到 Offer 七阶段漏斗；区分官网点击与真实投递、模拟训练与真实面试；统一服务端可信事件、版本化 `refs`/缺失引用质量标记，并默认从运营看板排除 demo/test/system | `utils/funnelAnalytics.js`、Analytics/职位/申请/简历路由与服务、运营看板、小程序埋点、`.env.example`、`docs/FUNNEL_ANALYTICS_CONTRACT.md`、专项与 smoke 测试 | `check:release` 156/156 通过、媒体 191.2 KB、Errors 0/Warnings 4；专项 4/4、smoke 67/67；未运行真实 E2E，未推送、未部署 |
| 2026-09-04 | Sprint 2.2：统一职位/校招 `dataMeta` 来源与新鲜度契约，修正正式职位主源优先级、历史职位伪造时间与分页复制，补齐校招短日期解析、明确截止过期、缓存/失败降级标记和小程序紧凑展示 | `utils/dataProvenance.js`、职位/校招路由与格式化器、小程序职位/校招适配和卡片、`docs/JOB_CAMPUS_DATA_PROVENANCE_CONTRACT.md`、专项与 smoke 测试 | `check:release` 151/151 通过、Errors 0/Warnings 4；未运行真实 E2E，未推送、未部署 |
| 2026-09-03 | Sprint 2 第一批：建立核心实体 `refs` 契约，统一官方岗位 ID 优先级、数值主键输出与申请 V4 状态；接通申请、简历、材料、面试、Today 和关键埋点引用 | `utils/coreEntityRefs.js`、`utils/applicationStatus.js`、V4 相关路由/服务、`docs/CORE_ENTITY_REFERENCE_CONTRACT.md`、专项与集成测试 | 143/143 tests 通过；`git diff --check` 通过；未运行真实 E2E，未改数据库结构，未推送、未部署 |
| 2026-09-03 | Sprint 1 仓库侧收口：将校招、申请文案、管理员限流、分享封面、审核 UI、测试和部署基线拆成可审查提交；统一 Node 20、4400、版本目录/current 软链接、共享数据、备份、PM2/Nginx 与手动生产发布；移除 n8n 默认密码和日志回显 | Git 提交 `35b8956` 至 `a9b92a6`、部署/安全文档 | `check:release` 137/137、媒体 191.2 KB、Errors 0/Warnings 4；完整 smoke 65/65、Shell/JS/JSON/YAML 静态校验和密钥扫描通过；未运行真实 E2E，未推送、未部署 |
| 2026-09-03 | Sprint 0 清理：完整归档旧备份、旧统一前小程序和 Banner 优化素材；同步 11 份历史开发文档到 Obsidian；注销旧部署工作树并保留独有部署分支；旧目录送入回收站 | `archives/cleanup-20260903/`、Obsidian `历史归档/2026-06旧版/`、Git worktree 元数据 | ZIP 15.54 MB、6,628 个条目可读取；11 份文档 SHA-256 校验一致；主项目分支/HEAD 不变；`check:miniprogram` 通过，微信预览正常 |
| 2026-09-03 | Sprint 0：确认 D 盘唯一主项目及旧目录 Junction；以 `codex/v4-development` 分支、`bcd6e8430710f374cf8dfab61dd319562c0a1b73` 为 Git 基线，恢复 1,588 个受 Git 跟踪的小程序文件，并从 Codex 历史日志恢复 8 月未提交的小程序增量（登录审核交互、AI 提示条、资源中心、校招刷新与文案、分享图及缓存）；恢复并压缩品牌 Logo | `miniprogram/`、`DEVELOPMENT_STATUS.md`、`DEVELOPMENT_LOG.md` | `npm run check:release` 通过：137/137 tests；媒体总量 191.2 KB；数据检查 Errors 0、Warnings 4；`git diff --check` 通过。未推送、未部署；用户已确认微信开发者工具预览正常 |
| 2026-08-25 | 修复微信分享卡片封面空白：移除首页失效的 404 线上图片，新增 5:4 包内分享封面；全局配置、后台配置、旧图片路径和客户端缓存统一迁移到新封面，并避免接口缓存继续下发旧地址 | 小程序分享工具/首页/图片资源、`utils/shareConfig.js`、`routes/share.js`、后台分享页与专项测试 | 全量测试 136/136、分享专项 2/2、`check:miniprogram` 通过；媒体总量 179.8 KB；微信预览因开发者工具登录过期未生成二维码 |
| 2026-08-12 | 将“申请材料库”收窄为“申请文案库”：移除整份简历 JSON 生成与展示，定制简历统一引导至简历中心；生成前强制选择有效简历并支持补充 JD，隐藏模型/提示词内部信息，历史定制简历记录不再进入文案列表 | `routes/v4/materials.js`、`routes/career-assets.js`、小程序 `application-materials`、材料工具与回归测试 | 待本批验证 |
| 2026-08-12 | 修复管理后台正确密码也会频繁被误封：后台登录限额改为按真实 IP + 用户名隔离，仅累计失败请求，成功登录不占用限额；同步重置并统一正式 `admin` 账号密码 | `middleware/rateLimit.js`、`server.js`、`tests/adminLoginRateLimit.test.js`与正式 `zhiyincareer-main` 实例 | 134/134 tests 通过；公网新密码连续登录 6 次均返回 200，第 6 次未再触发原 5 次误封，账号角色为 `super_admin` |
| 2026-08-10 | 修复生产校招已同步但首页仍显示旧批次：服务端按开放日期选取最新批次并禁止中间缓存，小程序每次进入首页强制刷新且携带新鲜度参数，同时升级本地缓存版本 | `routes/campus.js`、小程序 `utils/api-campus.js`、`pages/index/index.js`、部署工作流与校招回归测试 | 公网 API 已返回 2026-08-10 最新 28 条；校招内容测试 4/4、校招接口测试 2/2、`check:miniprogram` 通过 |
| 2026-08-10 | 将“职引睿选”新校招表同步到职引官网校招日历生产板块：修正生产定时任务的 Node 版本与共享数据库路径，增加校招专属配置白名单合并工具，并完成官网实际数据库全量同步 | `scripts/sync_feishu_server.js`、`scripts/run-campus-sync.sh`、`scripts/merge-campus-env.js`、`.env.example` 与校招回归测试 | 生产原始 11,513 条、有效 11,485 条、去重写入 11,467 条、数据库总计 11,498 条；131/131 tests、公网 API 与真实官网页面均显示 8 月 10 日最新内容 |
| 2026-08-10 | 统一缩小全端 AI 生成提示条：增加组件左右安全留白，压缩卡片高度、标签、字号与间距，修复长文案贴边拥挤；将模拟面试设置、面试对话和 AI 报告三处旧提示迁移为共享组件 | 小程序 `components/c-ai-disclosure`、3 个面试页面、审核检查与页面回归测试 | 全量测试 130/130、AI 提示专项 4/4、`check:miniprogram` 通过 |
| 2026-08-10 | 将校招数据源切换为“职引睿选”飞书主体下的新多维表格与指定视图；完成全量重爬并让首页、校招列表和详情统一读取后端同步数据，同时按开始时间自动推导招聘年度 | `.env.example`、`scripts/sync_feishu_server.js`、小程序 `pages/index`、`pages/campus`、`package-content/pages/campus-detail` 与校招回归测试 | 新表原始 11,485 条、有效 11,457 条、去重写入 11,439 条；全量测试 129/129、`check:miniprogram`、数据检查（错误 0）通过 |
| 2026-08-10 | 修复微信代码质量“图片和音频资源”误判理解：按开发者工具真实算法将编译包内媒体总量从 203.1 KB 降至 191.2 KB，并将本地检查由单文件 200 KB 修正为媒体总量严格小于 200 KB | `miniprogram/images/logo_google.png`、`scripts/check-miniprogram.js` | `check:miniprogram` 通过，媒体总量 191.2 KB / < 200 KB，主包约 1.00 MB |
| 2026-08-10 | 优化小程序登录审核交互：登录弹层增加显著关闭按钮和“暂不登录，先逛逛”入口；手机号授权被拒绝后立即退出弹层并返回当前页面，避免反复施压授权 | 小程序 `components/c-login-popup`、登录回归测试与小程序审核检查 | 全量测试 128/128、登录专项 4/4、`check:miniprogram` 通过 |
| 2026-08-10 | 重构资源中心排版：四个模块移除分组副标题，主标题改为蓝/绿/紫主题色胶囊；“内容与服务”由三行紧凑列表改为三张独立服务卡，并让页面底部延续浅蓝灰背景以消除白块 | 小程序 `pages/resources/resources.js`、`resources.wxml`、`resources.wxss` 与导航回归测试 | 资源中心回归 14/14、`check:miniprogram` 通过 |
| 2026-08-10 | 修复首页与校招页仍显示 6 月 9 日旧数据：优先读取已上线的飞书 2027 届校招源，完整映射中文字段、链接和同步日期；旧后端接口保留兜底并改为按更新时间排序，飞书记录详情支持直接打开；“新开”文案统一为“更新” | `db/database.js`、`db/formatters.js`、`routes/campus.js`、`routes/admin.js`、小程序校招数据适配/首页/列表/详情与测试 | 全量测试 127/127、`check:miniprogram`、数据检查（错误 0）通过；线上飞书内容源验证 33 条，首条毕马威记录公司、岗位、链接和 2026-07-09 同步日期映射正确 |
| 2026-08-04 | 修复统一搜索页职位长期停留在加载态：正式职位 API 与飞书人工职位源改为并行竞速，优先采用最先返回的非空结果；增加实时搜索序号和 12 秒加载兜底，防止慢速旧请求覆盖新关键词或无限转圈 | 小程序 `utils/api-jobs.js`、`package-user/pages/search/search.js` 与职位搜索回归测试 | 全量测试 125/125、`check:miniprogram`、数据检查（错误 0）通过；生产同链路搜索 `data analyst` 约 2 秒返回 10 个职位；微信开发者工具生成预览二维码成功 |
| 2026-08-04 | 按产品说明重构职位列表卡片与职位详情决策链路：新增统一职位展示适配层和复用卡片，收敛薪资、地点、标签、技能、AI 匹配、截止与投递状态；详情页依次展示核心信息、公司、匹配、条件、JD、要求、时间、公司介绍、相似职位和安全区固定操作栏，并保留收藏、详情跳转、外链投递、投递看板与 AI 分析 | 小程序 `utils/job-presenter.js`、`components/c-job-card/*`、`pages/jobs/*`、`package-user/pages/search/*`、`package-user/pages/job-detail/*` 与职位展示回归测试 | 全量测试 124/124、`check:miniprogram`、数据检查（错误 0）与微信开发者工具预览编译通过；主包 791.9 KB、`package-user` 451.4 KB |
| 2026-08-04 | 修复统一搜索页在防抖实时匹配时把每个输入片段写入搜索历史的问题：实时结果保持不变，历史仅记录用户点击搜索、键盘搜索或选择完整关键词的提交动作；加载时自动去重并清理已有连续前缀碎片 | 小程序 `package-user/pages/search/search.js` 与导航回归测试 | 全量测试 120/120、`check:miniprogram` 与数据检查通过；微信开发者工具预览编译成功，主包 777.7 KB |
| 2026-08-03 | 修复“我的简历”手动编辑弹层：恢复单行输入框可点击高度、光标及输入文字/占位符显示，统一工作、教育、项目、基本信息和技能表单 UI；保存时使用完整新对象更新，确保关闭弹层后内容立即回显 | 小程序 `package-career/pages/resume/resume.js`、`resume.wxml`、`resume.wxss` 与导航回归测试 | 全量测试 119/119、`check:miniprogram` 与数据检查通过；微信开发者工具预览编译成功，主包 777.7 KB |
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

- Codex merge_backend_impl（2026-10-14，隔离工作树 `codex/merged-backend-release-20261014`）：占用 `routes/jobs.js`、`scripts/healthcheck.js`、`services/feishuCompanyImport.js`、`deploy.sh`、`tests/releaseEngineering.test.js`、`tests/smoke.test.js`、`docs/JOB_CAMPUS_DATA_PROVENANCE_CONTRACT.md` 与本记录；选择性保留线上招聘版新增的近期岗位过滤、RemoteOK 地图覆盖及 Feishu 请求重试，同时保留目标版本全局岗位默认与发布安全门禁。历史岗位详情保留且标注时效风险、Feishu 非暂态错误不重试且错误信息脱敏、缺失共享配置拒绝发布，TCP 拒绝后的 readiness 重试已覆盖；文档说明全球产品定位不等于现有源覆盖全球本地职位。`check:release` 369 通过/2 Windows 跳过、Acceptance 29 通过/1 旧种子近期岗位不足的警告、Git Bash `bash -n deploy.sh` 与 `git diff --check` 均通过；仅本地合并，未提交、推送或部署。

- Codex deploy_guard_impl（2026-10-14）：占用 `deploy.sh`、`scripts/backup-production.sh`、`scripts/verify-pm2-instance.js`、`tests/releaseEngineering.test.js` 与本记录此行；修复 PM2 JSON 静默输出，分别保留原始 `current` 链接与 PM2 实际物理版本，切流前复核旧 PID/4400 监听者。`current` 用同目录临时软链接及 `mv -Tf` 原子替换；切流期间的 EXIT/INT/TERM 守护可在失败或中断时分别恢复旧进程与旧链接，PM2 身份辅助脚本固定新版本绝对路径。Linux 隔离假 PM2 故障注入覆盖新进程启动失败、健康检查失败及 TERM，三种错位回滚均通过；临时测试目录已清理。本地/远端 `bash -n`、聚焦 7 通过/2 Windows 跳过、全量 362 通过/2 Windows 跳过、`check:release`、`git diff --check` 通过；未执行生产部署、提交或推送。

- Codex CI 收口（2026-10-14）：占用 `tests/sprint4CareerCoach.test.js`、`tests/sprint5Networking.test.js` 与本记录；Linux CI 的两条旧资源页文案断言与当前已确认的资源分类不一致，只更新断言到当前产品结构，不变更业务实现。

- Codex 视觉验收（2026-10-14）：占用 `.agents/skills/zhiyin-miniprogram-pixel-replica/scripts/capture-and-compare.js` 与本记录；开发者工具已登录且 automation 端口可连接，但固定 8/15 秒操作超时导致视口、fixture 或导航中断。本轮仅允许增加可配置等待时间，不更改基准 PNG、差异阈值或遮罩。

- Codex release 集成（2026-10-14）：占用 `.gitignore` 与本记录新增行，整理当前工作区安全提交；仅排除本地 `artifacts/` 运行数据及根目录微信开发者工具配置，保留业务代码和设计基准。

- Codex（2026-10-14）：按 Human 最新截图调整资源页，顺序接续已完成的 ui_impl 视觉改动；范围 `miniprogram/pages/resources/resources.{js,wxml,wxss}`、资源页相关断言所在 `tests/{frontendVisualCheckpoint,navigationConfig,mobileWorkflow,checkpoint7}.test.js` 与本记录。已移除资源分类切换条，在同页展示全部 9 个可用入口及未开放的“我的已购”，精选卡片改为图文同排并缩短；搜索覆盖全部资源，原有目标上下文与题型参数传递保留。相关回归 94/94、`check:miniprogram`、`git diff --check` 通过；待微信开发者工具视觉复核，未改底部主导航，未提交/发布。

- Codex ui_impl（2026-10-14）：占用 `miniprogram/pages/ai-career/ai-career.{wxml,wxss}`、`miniprogram/custom-tab-bar/index.wxss`、`miniprogram/pages/index/index.{js,wxml,wxss}`、`miniprogram/pages/{jobs,resources}/*.wxss`、`miniprogram/utils/{app-config,feature-flags,data-provenance}.js`、`tests/{checkpoint8,frontendVisualCheckpoint,campusContent}.test.js`、`.agents/skills/zhiyin-miniprogram-pixel-replica/references/screens.json` 与本记录此行；会员缓存/失败关闭、AI 侧栏与网申触控语义、辅助文字对比度和缓存时效修复完成。聚焦测试 37/37、`check:miniprogram`、Impeccable 检测（空结果）与 `git diff --check` 通过；390×844 微信截图叠加由发布验收执行，扩充内容与旧首页原型基准存在明确冲突。不占用发布脚本或 `tests/all.test.js`，未替换已确认原型图，未提交/推送。

- Codex release_impl（2026-10-13 至 14）：占用 `tests/checkpoint7.test.js`、`tests/releaseEngineering.test.js`、`tests/all.test.js`、`scripts/backup-production.sh`、`scripts/verify-pm2-instance.js`、`deploy.sh`、`server.js`、`.github/workflows/test.yml`、`.github/workflows/deploy.yml`、`docs/production-deploy.md` 与本记录顶部；已修复过期页面断言、备份失败误报、发布前隔离快照/只读迁移状态门禁、候选与切流监听进程身份校验/回滚及 CI。切流后从物理 release 执行 PM2，`/current` 别名拒绝冒充新实例。上轮全量测试 352 pass/1 Windows-only skip、Acceptance 30/30；最后一项修改后的聚焦测试 6 pass/1 Windows-only skip、Shell 语法与差异检查通过。生产 Nginx 实际配置路径须设置 GitHub production Environment 变量 `PRODUCTION_NGINX_CONFIG_PATH`。生产 migration 状态与真实 Linux 备份/部署仍待人工验证；公网 API 404 将阻止发布并触发回滚。未执行生产迁移 apply、生产部署、共享库写入或 Git 提交。

- Codex（2026-10-13）：首页内容密度优化代码完成，待 390×844 微信开发者工具截图验收，未提交/发布。范围 `miniprogram/pages/index/index.{js,wxml,wxss}`、`miniprogram/package-ai/pages/jd-match/jd-match.js`、对应导航/视觉/校招内容测试及本记录；增加常用功能、最多两条真实且近期发布的岗位、校招动态，保留当前蓝白视觉与原有业务入口。专项测试 46/46、`check:miniprogram`、布局检测与 `git diff --check` 通过；全量测试 346/347，唯一失败为既存 `checkpoint7.test.js:149` 仍断言“我的申请”，与当前“我的”页面结构冲突。开发者工具 CLI 服务端口关闭，尚未完成编译截图及原型叠加，不视作视觉验收通过。

- Codex（2026-10-13）：按首页截图收紧“今日重点”和“申请进度”卡片：主行动卡最小高度由 276rpx 调至 218rpx，进度卡由 226rpx 调至 174rpx；同步压缩内部留白，保留主按钮及“查看全部”的 88rpx 点按高度。`check:miniprogram`、首页视觉与导航专项 37/37、`git diff --check` 通过；尚待微信开发者工具实机视觉复核，未提交/发布。

- Codex（2026-10-10）：恢复小程序旧版视觉语言、悬浮 TabBar 与上下文 AI 入口。范围 `miniprogram/custom-tab-bar/*`、五个一级页面 WXSS、`components/c-job-card`、`package-ai/pages/ai-assistant/*` 及相关导航/视觉测试；保留五 Tab、申请工作流和数据库隔离，不回退业务结构。状态：代码完成；336/336 全量测试、30/30 Acceptance、`check:miniprogram` 与 `git diff --check` 通过，主数据库指纹未变；待微信开发者工具人工视觉验收。

2026-09-20 Codex：Web P0 完善（代码与隔离验收完成，未提交/部署），范围 `public/web/*`、AI 会话 service/route、新增 Web 登录衔接 service/route、`server.js`、V4 申请/简历路由、小程序设置页、隔离 API/浏览器测试与 Web 开发文档。风险：登录衔接仅允许已登录的小程序用户生成短期一次性凭证，不按未核验的邮箱/手机号合并账号；验证过期/重放/匿名拒绝。上传复用已有 PDF 文件头和大小检查；简历新版本验证归属与并发冲突，AI 验证跨申请/退出隔离。全部测试使用临时数据库，不调用真实模型，不修改生产数据。

- Codex（2026-09-20）：校招关注未展示在收藏的问题已修复；用户确认点击“加入关注/截止提醒”，原操作只存提醒。范围 `miniprogram/utils/favorites.js`、`miniprogram/package-content/pages/campus-detail/campus-detail.js`、`miniprogram/package-user/pages/favorites/favorites.js`、`tests/mobileWorkflow.test.js` 和本文件。关注成功或本地兜底均加入校招收藏，取消提醒保留收藏；进入收藏页导入本机旧关注及账号有效云端提醒，导入标记/删除 tombstone 防止取消收藏后反复恢复。默认展示最近收藏所属分类，异步刷新保留手动选择；排序使用 iOS 安全日期解析。专项 30/30、隔离库全量 250/250 与 `check:release` 通过，保留原 3 项支付静态提示。未执行真机 E2E、尚未发布；重新编译进入收藏页触发历史关注补入（仅本地保存且已清缓存的数据无法恢复）。

- Codex（2026-09-20）：微信上传检查“主包未使用 JS：utils/application-materials.js”已修复。该工具仅被 AI 助手与申请材料页使用，已迁移至 `miniprogram/package-ai/utils/application-materials.js`，同步两页引用及工具的公共 API 引用；范围为上述三个 JS 文件与本记录。仅调整分包归属，功能不变。导航/移动流程 45/45、小程序静态检查（含 require 路径）通过，主包估算降至 1.00 MB；待开发者工具重新编译复查上传质量检查，尚未上传。

- Codex（2026-09-20）：首页校招截止日期 `10.25` 的 iOS 解析警告已修复。范围 `miniprogram/pages/index/index.js`、新增 `miniprogram/utils/campus-deadline.js`、`tests/campusContent.test.js` 和本文件。优先使用接口规范日期；短日期按招聘年份/开始日期推断，兼容跨年、闰年，非法日期和非日期说明保持原文；按北京时间计算剩余天数，不把原始文本交给 Date。同步更新校招排序的 SQLite 时间解析、升级首页缓存版本。专项测试 54/54、小程序静态检查通过；未运行微信真机 E2E、未发布，重新编译后验证。

- Codex（2026-09-20）：小程序 API 排查修复已完成。范围 `services/v4TodayTasks.js`、相关测试、`miniprogram/utils/daily-tasks.js`、`util.js`、`jd-match.js`、`pages/index/index.js`、`components/home-campus-updates/*`、API 巡检脚本与记录。Today 跨天/重复键冲突已定点发布，官网精确 CORS 域名已补齐并备份。公网 58 项查询：56 正常、2 招聘关闭；Today 同步/重复请求均 200，历史保持正确。隔离库 `check:release` 243/243 及各检查通过。未改鉴权/支付核心或数据库结构；iOS 日期与 WXSS 修复在本地小程序，尚未发布。详见 `docs/API_AUDIT_20260920.md`。

- Codex（2026-09-20）：资源中心流程工具去掉文字图标、降低卡片高度，内容与服务改用历史时钟、资讯报纸、机构评分、指南书本四个本地图形图标。范围 `miniprogram/pages/resources/resources.{js,wxml,wxss}`、`miniprogram/images/resource-*.png` 和本文件；已完成，定向测试 45/45、`check:miniprogram` 通过（媒体 196.0 KB），20 组浏览器静态排版与图片解码检查通过，未进行微信真机验收、未发布。

- Codex（2026-09-20）：按用户补充要求恢复“我的简历”图标，个人记录改为四列（简历、收藏、消息、我的面经），直达现有简历页。范围 `miniprogram/pages/profile/profile.{js,wxml,wxss}`、`tests/navigationConfig.test.js` 和本文件；已完成，导航检查 23/23、`check:miniprogram` 通过，未发布。

- Codex（2026-09-20）：“我的”去除与资源中心重复的工具和资产入口，保留个人资料、会员、收藏、消息、我的面经与账号服务。范围 `miniprogram/pages/profile/profile.{js,wxml,wxss}`、`tests/navigationConfig.test.js` 和本文件；已完成，定向 45/45 和小程序检查通过，未发布。

- Codex（2026-09-20）：资源中心紧凑布局，将纵向全部展开改为分类切换、双列工具和四列服务入口。范围 `miniprogram/pages/resources/resources.{js,wxml,wxss}`、`tests/mobileWorkflow.test.js`、`tests/navigationConfig.test.js` 和本文件；已完成，专项测试 45/45、小程序静态检查和 20 组浏览器静态排版检查通过，未进行微信真机验收、未部署。

- Codex（2026-09-16）：恢复首页三个 Banner 轮播，并恢复首页会员权益入口（位于今日求职计划之后）；后台 Banner 不足时补齐岗位、校招、AI 面试默认 Banner。范围 `miniprogram/pages/index/index.js`、`index.wxml`、测试与文档；已完成，定向测试 43/43、`check:miniprogram` 通过。

2026-09-16—2026-09-18 Codex：`routes/ai-conversations.js`、`services/aiConversations.js`、`db/migrations/0007_ai_conversations.sql`、`server.js`、`public/web/app.js`、Web 隔离测试及开发文档。任务：Web AI 服务端会话、上下文和失败/取消恢复；已完成。

风险与验证：新增会话表仅增量建表，不改现有业务表；隔离库验证重复执行、事务、跨用户拒绝、重复 requestId 幂等、失败和取消状态、AI 结果未经确认不写入申请。`node --check`、Web 专项 4/4（含隔离 API 11/11）、数据库迁移 5/5、AI 质量 7/7 通过；旧 `/api/ai/assistant` 保持兼容。真实模型和生产部署待后续验收。

- Codex：按用户最新要求恢复第四位资源中心 Tab，并按求职流程整合 AI 专家工具。范围 `miniprogram/app.json`、`custom-tab-bar/index.js`、`utils/navigation.js`、`utils/util.js`、`package-ai/pages/ai-assistant/ai-assistant.js`、`pages/resources/*`、`tests/navigationConfig.test.js`、`tests/mobileWorkflow.test.js` 与 P0/5.0 规划文档；已完成，237/237 与 `check:release` 通过，未部署。

- Codex（2026-09-16）：首页 Banner 移至搜索下方、今日计划上方，间距改为 Banner 下方留白；范围 `miniprogram/pages/index/index.wxml`、`index.wxss` 和本文件；已完成，`check:miniprogram` 和定向 `git diff --check` 通过，未部署。

- Codex（2026-09-16）：申请详情加载/保存/状态更新可靠性；范围 `miniprogram/package-user/pages/application-detail/*`、`tests/mobileWorkflow.test.js`、本文件和 `docs/V5_P0_MOBILE_WORKFLOW_20260915.md`；已完成，全量 234/234 与发布检查通过，未提交、未部署。

- Codex：撤回重复首页待办卡；范围 `miniprogram/pages/index/index.{js,wxml,wxss}`、`tests/navigationConfig.test.js`、`docs/V5_P0_MOBILE_WORKFLOW_20260915.md` 和本文件；已完成，导航回归 21/21、`check:miniprogram` 和定向 `git diff --check` 通过，未提交、未部署。

5.0 P0 移动闭环（2026-09-15，Codex 本批已完成）：岗位列表/详情、公共岗位卡片、申请状态工具、进度页、我的资源入口及专项测试已完成，释放占用。本批仅复用现有 V4 API，未修改 Web、后端路由和数据库。

| 负责人 | 文件 | 任务 | 状态 |
|---|---|---|---|
| Codex | `routes/v4/applications.js`、`services/v4Application*.js`、`public/web/*`、Web 专项/浏览器测试、开发文档和修改记录 | Web 第二批（2026-09-15）：表格/看板、精确筛选/排序/分页、批量预览/更新/撤销、工作区聚合、关联隔离和安排保存 | 已完成本批；隔离 API 场景 7/7、前端数据检查 3/3、Edge 浏览器验收通过；发布检查 214/214、AI 矩阵 7/7、小程序检查通过；未做真实微信 E2E，未推送/部署 |
| Codex | `public/web/index.html`、`public/web/styles.css`、`public/web/app.js`、`server.js`、`routes/ai.js`、`tests/webWorkbench.test.js`、`docs/WEB_APPLICATION_WORKBENCH_DEVELOPMENT_PLAN_20260914.md`、`CHANGELOG_AI.md` | Web 用户侧首个可运行版本：登录/注册、工作台、申请看板首版、关键词/状态筛选、申请详情状态变更、Today 任务完成和 AI 专家连续问询；传递公司、岗位和申请标识并同步勾选开发文档 | 已完成；`node --check`、全量 209/209 tests、`git diff --check` 通过；真实浏览器/微信双端验收待 Human |
| Codex | `miniprogram/package-career/pages/career-coach/*`、`tests/sprint4CareerCoach.test.js`、开发记录 | 修复竞争力陪跑登录按钮只更新状态、未挂载登录弹层而无响应 | 已完成；专项 6/6、全量 204/204、发布检查和微信 CLI preview 通过 |
| Codex | `miniprogram/package-career/pages/career-coach/career-coach.json`、`tests/sprint4CareerCoach.test.js`、开发记录 | 修复竞争力陪跑分包页面在按需注入时将 AI 说明组件解析为 `wx://not-found` | 已完成；专项 6/6、全量 204/204、发布检查和微信 CLI preview 通过 |
| Codex | `miniprogram/utils/date-time.js`、`miniprogram/utils/favorites.js`、`tests/sprint8Reliability.test.js`、开发记录 | 修复收藏同步解析 SQLite 日期时的 iOS 兼容警告，并保持 UTC 排序语义 | 已完成；专项 7/7、全量 204/204 与发布检查通过；未运行真实 E2E，未部署 |
| Codex | `routes/notify.js`、`services/v4TodayTasks.js`、Sprint 8 schema/migration、收藏请求工具、专项测试和文档 | Sprint 8：提醒派发幂等与有界并发、Today 跨设备增量同步、收藏统一请求层与离线补传 | 已完成；全量 202/202 与发布检查通过；真实验收和生产 migration 待 Human，不推送、不部署 |
| Codex | 商业套餐/权益/额度账本、退款审计、运营告警、会员小程序页、Sprint 7 migration/测试/文档 | Sprint 7：Free/Pro/场景包、统一商业账本、Mock 支付与退款一致性、可暂停灰度及异常告警 | 已完成；195/195 tests 与 `check:release` 通过，真实支付与外部退款保持关闭，不运行真实 E2E，不推送、不部署，生产 migration 待 Human |
| Codex | OA/Project Builder/Job Trust V4 数据表、服务、路由、小程序页面、专项测试和文档 | Sprint 6：OA 计划/计时/错题/统计，证据导向项目里程碑/交付物/验收/真实成果确认，以及可追溯岗位可信度评分 | 已完成；190/190 tests 与 `check:release` 通过，不调用真实 AI，不运行真实 E2E，不推送、不部署，生产 migration 待 Human |
| Codex | Networking V4 数据表/服务/路由、Today 关联、小程序 Networking 页面、专项测试和文档 | Sprint 5：联系人 CRM、五类可编辑草稿、跟进提醒、Referral 漏斗及岗位/简历/申请关联 | 已完成；182/182 tests 与发布检查通过，只生成/保存/复制草稿，不自动外发，不调用真实 AI，不运行真实 E2E，不推送、不部署 |
| Codex | `miniprogram/package-career/pages/career-coach/*`、`tests/sprint4CareerCoach.test.js`、开发记录 | 修复竞争力陪跑将 401、网络错误和残缺响应误渲染为空白的问题 | 已完成；专项 6/6、全量 203/203 与发布检查通过；未运行真实 E2E，未部署 |
| Codex | Job Match、V4 简历中心/材料、面试空间/报告、Today 回写、小程序对应页面、专项测试与文档 | Sprint 3：可行动岗位分层、JD 定制简历确认式新版本、Interview Brief 与弱项复练闭环 | 已完成；170/170 tests 与发布检查通过，不调用真实 AI，不运行真实 E2E |
| Codex | `db/migrate.js`、`db/migrations/`、数据库迁移/备份演练脚本、相关测试与文档 | Sprint 2.5：建立 schema migration baseline，在隔离数据库验证备份、迁移、幂等、失败事务、恢复与回滚 | 已完成自动化与隔离演练；生产 baseline 登记待 Human，不运行真实 E2E |
| Codex | `services/v4AiRuntime.js`、`services/v4Agents.js`、AI 路由、`utils/aiSafety.js`、匿名样本/门禁辅助程序、测试/脚本/文档 | Sprint 2.4：AI 异常矩阵、PII/真实性/确认写入/额度质量门禁 | 已完成自动化基线；真实供应商 staging 抽样待 Human，不运行真实 E2E |
| Codex | `utils/funnelAnalytics.js`、Analytics/职位/简历/申请/面试路由与服务、运营漏斗、小程序埋点、相关测试/文档 | Sprint 2.3：统一求职漏斗事件与 `refs`，隔离 production/demo/test/system 数据 | 已完成；兼容式 Analytics 加列，不运行真实 E2E |
| Codex | `utils/dataProvenance.js`、职位/校招路由与格式化器、小程序职位/校招适配与相关测试/文档 | Sprint 2.2：统一数据来源、更新时间、过期与失败降级口径，停止伪造本地职位新鲜度 | 已完成；发布检查通过，未运行真实 E2E，未推送、未部署 |
| Codex | `utils/coreEntityRefs.js`、`utils/applicationStatus.js`、V4 核心数据路由/服务、相关测试和 Sprint 2 文档 | Sprint 2 第一批：统一核心对象关联 ID 与申请状态输出，修复岗位 ID 双轨造成的跨模块错链 | 已完成；默认不运行真实 E2E |
| Codex | `scripts/run-campus-sync.sh`、`scripts/merge-campus-env.js`、`.env.example`、校招同步脚本与测试 | 将新校招表持续同步至职引官网生产共享数据库，隔离营销飞书配置并修复定时任务 Node/数据库路径 | 已完成；生产写入 11,467 条，131/131 tests、公网 API 和真实官网页面显示 8 月 10 日最新记录 |
| Codex | 小程序 `components/c-ai-disclosure/*`、模拟面试设置/对话/报告页面、`tests/favoriteReminder.test.js`、`scripts/check-miniprogram.js` | 统一缩小所有 AI 提示条，增加左右安全留白并清理三处重复旧样式 | 已完成；130/130 tests、AI 提示专项 4/4、小程序检查通过 |
| Codex | `.env.example`、`scripts/sync_feishu_server.js`、小程序校招首页/列表/详情与相关测试 | 使用“职引睿选”飞书应用持续同步新校招 Base 指定视图，移除客户端旧飞书代理数据优先级，并修正招聘年度推导 | 已完成；新表全量同步写入 11,439 条，129/129 tests、小程序检查和数据检查通过 |
| Codex | `miniprogram/images/logo_google.png`、`scripts/check-miniprogram.js` | 按微信开发者工具实际规则压缩媒体总量，并增加一致的本地防回归检查 | 已完成；媒体总量 191.2 KB，`check:miniprogram` 通过 |
| Codex | 小程序 `components/c-login-popup/*`、`tests/loginGate.test.js`、`scripts/check-miniprogram.js` | 增加清晰有效的关闭/暂不登录路径，并在拒绝手机号授权后返回当前页面，修复登录环节审核问题 | 已完成；128/128 tests、登录专项 4/4、小程序检查通过 |
| Codex | 小程序 `pages/resources/resources.js`、`resources.wxml`、`resources.wxss` 与资源中心回归测试 | 移除四个模块副标题，统一主题色标题胶囊，并将“内容与服务”改为独立卡片布局、修复底部白块 | 已完成；资源中心回归 14/14、小程序检查通过 |
| Codex | 校招数据表/接口/格式化器、小程序校招数据适配/首页/列表/详情、相关测试 | 修复首页仍显示 6 月 9 日旧校招：接入更新的飞书校招源，统一按同步更新时间排序并兼容飞书记录详情 | 已完成；127/127 tests、小程序检查、数据检查与线上飞书详情映射验证通过 |
| Codex | 小程序 `utils/api-jobs.js`、`package-user/pages/search/search.js` 与搜索回归测试 | 修复职位搜索因飞书职位源超时而长期停留在加载态：正式职位 API 优先、飞书并行兜底，并防止实时搜索的旧请求覆盖新结果 | 已完成；125/125 tests、小程序检查、数据检查、生产同链路搜索与微信预览通过 |
| Codex | 小程序职位展示适配工具、`components/c-job-card`、`pages/jobs/*`、`package-user/pages/search/*`、`package-user/pages/job-detail/*` 与回归测试 | 按产品说明重构职位列表卡片和职位详情信息架构，统一薪资、截止、标签、技能、匹配及缺省字段展示，同时保留收藏、详情跳转、投递看板和 AI 匹配链路 | 已完成；124/124 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | 小程序 `package-user/pages/search/search.js` 与导航回归测试 | 保留搜索输入防抖实时匹配，但仅在用户主动提交搜索时写入历史，并清理历史中的连续输入前缀碎片 | 已完成；120/120 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | 小程序 `package-career/pages/resume/resume.js`、`resume.wxml`、`resume.wxss` 与回归测试 | 修复在线简历手动编辑弹层中单行输入框高度压缩、无法稳定聚焦/回显及保存后列表不立即显示的问题，并统一工作、教育、项目和基本信息表单 UI | 已完成；119/119 tests、小程序检查、数据检查与微信预览编译通过 |
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
| Codex | `scripts/e2e-3.0-bot.js`、微信开发者工具自动化报告 | V4 真实 E2E 兼容修复 | 脚本语法已验证；按 Human 决定真实 E2E 暂停且非默认，用户已确认人工预览正常 |

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


| 2026-09-14 | 完成官网 Web 与小程序重新分工规划：Web 作为申请管理主工作台，小程序作为提醒、快速更新和面试练习助手；明确申请管理 MVP、申请包、面试复盘的 Web 迁移顺序 | docs/WEB_MINIPROGRAM_PRODUCT_PLAN_20260914.md | 规划文档完成，未改运行代码 |

## 面试训练收敛阶段（2026-09-14）

| 事项 | 文件 | 验证 |
|---|---|---|
| 面试训练上下文串联：申请详情携带 `applicationId` 进入岗位面试空间；空间提供返回申请与复盘中心入口；AI 模拟面试将申请上下文写入报告和历史；报告错题复练保留申请上下文 | `miniprogram/package-user/pages/application-detail/application-detail.js`、`miniprogram/package-ai/pages/interview-space/*`、`interview-setup/*`、`interview-dialog/*`、`ai-report/*`、`interview-notebook/interview-notebook.js`、`tests/navigationConfig.test.js` | 208/208 tests，`check:miniprogram` 与 `git diff --check` 通过 |
| 面试素材入口上下文复用：岗位面试空间写入 interviewContext，题库、STAR 和模拟面试入口自动复用公司、岗位和申请 | miniprogram/package-ai/pages/interview-space/interview-space.js、miniprogram/package-ai/pages/interview-setup/interview-setup.js、miniprogram/pages/experiences/experiences.js、miniprogram/package-content/pages/star-library/star-library.js、miniprogram/package-content/pages/question-detail/question-detail.js、	ests/navigationConfig.test.js | 待本轮测试完成 |

## 小程序 UI/UX 收敛阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `miniprogram/app.wxss`、首页 Today 工作台、校招卡片、首页求职计划、非首屏 Logo、`tests/navigationConfig.test.js`、`docs/UI_UPGRADE_20260915.md` | 补齐全局设计 Token，修复首页完成态和任务落地动作，明确校招卡片操作，降低首页渐变差异并补充图片懒加载 | 已完成；211/211 tests、导航专项 20/20、`check:miniprogram` 和 `git diff --check` 通过；真机回归待 Human |

## Web 申请包操作阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `services/v4ApplicationWorkspace.js`、`routes/v4/applications.js`、`db/v4Schema.js`、`public/web/applications.js`、`public/web/applications.css` | 简历版本选择、JD 匹配、ATS 检查、申请材料编辑/归档、AI 草稿确认写入 | 已完成；`npm test` 215/215，通过 Web 隔离场景及语法检查 |

本阶段未进行真实微信双设备验收、生产部署或推送。当前剩余首期事项：Web 岗位创建入口、AI 通用回答确认写入备注/任务、双端人工验收。

## Web 岗位入口阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `public/web/app.js`、`public/web/styles.css` | Web 职位搜索、匹配分数展示、一键加入申请管线 | 已完成；沿用 V4 岗位与申请接口 |

## 职引 5.0 P0 小程序收敛阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `miniprogram/app.json`、`custom-tab-bar`、`utils/navigation.js`、`utils/util.js`、AI/申请页导航 | 小程序一级导航收敛为：首页、找岗位、进度、我的；AI 改为上下文页面，不再占用一级 Tab | 已完成；导航专项与全量 215 项测试通过 |
| Codex | `miniprogram/pages/jobs/*`、既有岗位图标 | 将校招日历作为找岗位模块入口保留，支持从岗位搜索页进入校招批次和截止日期列表 | 已完成；`check:miniprogram` 通过 |

### P0 第二批：移动申请闭环

- 岗位卡片增加待投递/查看进度；服务端成功后显示状态，重复点击合并请求，409 读取已有申请，只有感兴趣记录可以推进至待投递，不覆盖面试和 Offer。
- 统一移动状态展示，收藏和准备申请不再显示为已投递；详情页复制官方链接不再自动写已投递，也不再复制个人简历摘要。
- 收藏继续使用原收藏同步；详情页收藏不再额外写申请记录，避免覆盖已有进度。明确点击待投递才创建申请；已有记录保留。
- 进度页增加独立 OA 筛选、列表改状态（使用服务端合法流转与版本检查），移除漏斗、工具宫格和材料准备度展示。
- 空列表和网络失败分开；进度页拦截过期请求，登录失效退出加载态；手动新增失败保留表单和同一个 jobId 供重试。
- 我的增加完整资源目录入口；校招入口移出岗位页固定头部，避免遮挡；复用原岗位选中/未选中图标，移除重复搜索图。
- 验证：新增移动流程测试 14/14，`check:release` 通过，全量 229/229；小程序媒体 191.2 KB、主包估算 1.04 MB；数据检查错误 0，保留既有 4 条提示。未部署、未进行微信真机 E2E。
- 详情及剩余 P0 范围见 `docs/V5_P0_MOBILE_WORKFLOW_20260915.md`，不表示整个 5.0 P0 已全部完成。

## Web AI 申请上下文与确认写入（2026-09-15）

- 已完成：服务端读取本人申请状态、下一步及 JD 摘要；AI 回答可编辑预览后确认保存为申请备注或申请任务。
- 权限验证：必须显式 confirm；跨用户申请拒绝；备注/任务长度有上限。
- 最新验证：Web 专项 4/4（隔离 API 场景 9/9），Edge 浏览器验收通过。
- 最终全量回归 215/215，`check:release` 通过；同期导航约定已统一，小程序检查通过。
- 未推送、未部署、未进行真实微信双设备验收。
