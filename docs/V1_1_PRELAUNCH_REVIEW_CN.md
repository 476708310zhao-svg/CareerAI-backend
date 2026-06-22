# 职引求职小程序 V1.1 上线前审查报告

生成日期：2026-06-11
审查范围：当前仓库完整代码、页面目录、组件、接口、数据库结构、配置文件和已有文档。
仓库根目录：`C:\Users\admin\Desktop\求职小程序\jobapp-server`

## 0. 审查结论

当前版本不建议直接按完整功能形态上线。代码基础已经比较扎实，页面、接口、后台、测试和隐私文档都有雏形，但 V1.1 的上线策略应该先做减法，聚焦基础找岗位闭环。

建议将 V1.1 定义为“上线前修复版”，保留：首页、职位列表、搜索筛选、职位详情、收藏、复制投递链接或保存投递记录、校招日历、求职资讯、登录、简历上传、反馈、隐私政策和必要后台管理。

上线前必须优先处理：

| 优先级 | 必须处理事项 | 原因 |
| --- | --- | --- |
| P0 | 确认生产环境变量、强 JWT 密钥、强后台密码、支付开关或微信支付参数 | 否则可能生产启动失败或存在账号安全风险 |
| P0 | 处理通用外链 webview 和投递链接打开方式 | 任意外链 webview 可能触发微信业务域名或审核风险 |
| P0 | 微信后台隐私指引、业务域名、合法域名、敏感权限与实际开放功能保持一致 | 审核和合规风险 |
| P1 | 收敛首页、VIP、AI、高级工具入口 | V1.1 范围过重，失败点过多 |
| P1 | 修正投递文案和行为 | 避免用户误以为已经完成真实投递 |
| P1 | 收藏、浏览记录、用户中心统计改为可解释且一致 | 当前本地和服务端数据混用 |
| P1 | 校招订阅提醒在模板 ID 未配置前降级展示 | 避免不可用承诺 |
| P1 | 补足岗位数据或确认聚合任务稳定 | 外部接口失败时列表可用性不足 |

## 1. 验证命令结果

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `npm run check:miniprogram` | 通过 | 主包 0.59 MB，分包大小正常 |
| `npm run check:data` | 通过，有 3 个 warning | fallback 岗位仅 18 条，`routes/payment.js` 含 local/test/demo wording |
| `npm run check:release` | 工具超时中断，但输出显示测试已跑完 | `npm test` 显示 33 个测试通过，随后进入数据检查阶段 |

未做事项：未使用微信开发者工具或真机做人工回归。本报告基于静态扫描、接口/路由检查、数据库结构读取和现有自动化检查。

## 2. 当前真实完成情况

| 一级模块 | 二级功能 | 对应页面路径 | 对应代码文件 | 是否已开发 | 是否已接入真实接口 | 是否存在占位数据 | 是否可以正常使用 | 发现的问题 | 优先级 |
| ---- | ---- | ------ | ------ | ----- | --------- | -------- | -------- | ----- | --- |
| 首页 | 推荐岗位、入口、Banner | `miniprogram/pages/index/index` | `miniprogram/pages/index/index.js`, `routes/banners.js`, `miniprogram/utils/api.js` | 已开发 | 部分接入 | 有缓存和兜底逻辑 | 基本可用 | 推荐岗位依赖聚合接口与缓存，入口偏多，AI/VIP/高级功能提前暴露 | P1 |
| 职位列表 | 岗位聚合列表 | `miniprogram/pages/jobs/jobs` | `miniprogram/pages/jobs/jobs.js`, `routes/jobs.js`, `routes/aggregate.js` | 已开发 | 已接入 `/api/jobs/aggregate` | demo fallback 关闭，本地 fallback 数据仅 18 条 | 基本可用 | 聚合表当前为空，外部接口失败时可用岗位量不足 | P1 |
| 搜索和筛选 | 关键词、城市、岗位类型、签证友好等 | `miniprogram/pages/jobs/jobs`, `miniprogram/package-user/pages/search/search` | `jobs.js`, `search.js`, `routes/jobs.js` | 已开发 | 已接入 | 有本地搜索历史 | 基本可用 | `jobSearchHistory` 与 `searchHistory` 两套 key 并存，体验不统一 | P2 |
| 职位详情 | 岗位详情、公司、JD、投递入口 | `miniprogram/package-user/pages/job-detail/job-detail` | `job-detail.js`, `routes/jobs.js` | 已开发 | 已接入 `/api/jobs/detail` | 有 snapshot/mock 兜底 | 基本可用 | “一键投递”实际是本地记录加外链，不是真正投递闭环 | P1 |
| 收藏岗位 | 本地收藏、登录后后台同步 | 多页面使用 | `miniprogram/utils/favorites.js`, `routes/favorites.js` | 已开发 | 写入已接入 | 本地优先 | 可用但不完整 | 收藏页只读本地，不主动从服务端恢复，跨设备不闭环 | P1 |
| 浏览记录 | 详情浏览历史 | 无独立页面 | `job-detail.js`, `profile.js`, `miniprogram/package-agency/utils/store-keys.js` | 部分开发 | 未接入 | 本地记录 | 不完整 | `jobBrowseHistory` 与 `viewHistory` 混用，用户中心统计漏详情浏览 | P1 |
| 投递跳转 | 外链投递、投递看板 | `job-detail`, `applications`, `apply-form` | `job-detail.js`, `applications.js`, `apply-form.js`, `routes/apply.js` | 部分开发 | 部分接入 | 有本地投递记录 | 不完整 | 主链路没有进入 `apply-form`，通用 webview 外链存在微信业务域名和审核风险 | P0 |
| 校招日历 | 校招列表、筛选、订阅、详情 | `miniprogram/package-content/pages/campus`, `campus-detail` | `campus.js`, `campus-detail.js`, `routes/campus.js` | 已开发 | 已接入 | fallback 关闭 | 基本可用 | 订阅消息模板 ID 为空，提醒能力降级 | P1 |
| 求职资讯 | 资讯列表、详情 | `miniprogram/package-content/pages/news`, `news-detail` | `news.js`, `news-detail.js`, `routes/news.js` | 已开发 | 已接入 | 有静态 fallback 内容 | 基本可用 | 部分内容仍像内置文章，需要上线前确认版权与时效 | P2 |
| AI 求职工具 | AI 助手、面试、简历/项目/ATS 等 | `miniprogram/package-ai/*`, `miniprogram/package-career/*` | `routes/ai.js`, 多个 AI 页面 | 已开发较多 | 部分接入 | 有本地历史和示例 | 不建议 V1.1 全量开放 | 功能过重，保存与权益边界不统一，部分 AI 接口权限和会员边界需统一 | P1 |
| 用户中心 | 个人页、统计、菜单 | `miniprogram/pages/profile/profile` | `profile.js`, `routes/users.js` | 已开发 | 部分接入 | 本地统计 | 基本可用 | 浏览、收藏、投递统计主要来自本地，不是服务端真实汇总 | P1 |
| 登录授权 | 微信登录、手机号、隐私授权 | `miniprogram/components/c-login-popup` | `c-login-popup.js`, `routes/users.js`, `middleware/auth.js` | 已开发 | 已接入 | 无明显占位 | 基本可用 | 生产 JWT、管理员账号、环境变量配置需要加固确认 | P0 |
| 简历上传 | 简历表单、PDF 上传、解析 | `miniprogram/package-career/pages/resume/resume` | `resume.js`, `routes/resumes.js`, `routes/upload.js` | 已开发 | 已接入 | 本地草稿 | 基本可用 | 未登录可本地保存，登录后同步逻辑需回归 | P1 |
| 会员权益 | VIP 展示、支付接口 | `miniprogram/package-user/pages/vip/vip` | `vip.js`, `routes/payment.js` | 页面已开发 | 后端支付接口有保护 | 有 mock 支付逻辑 | 不建议开放购买 | 前端支付被主动 return，页面仍展示价格，容易误导 | P1 |
| 客服和咨询 | 意见反馈、邮箱联系 | `feedback`, `about`, `settings`, `privacy` | `routes/feedback.js`, `feedback.js` | 已开发 | 反馈已接入 | 无客服会话 | 基本可用 | 未发现小程序原生 `open-type="contact"` 客服入口，主要靠反馈表和邮箱 | P2 |
| 后台管理 | 内容、职位、用户、会员、上传等 | `admin/*.html` | `routes/admin/*`, `admin/js/common.js` | 已开发 | 已接入 | 无明显占位 | 基本可用 | 管理员密码强度、部署权限、日志需要上线前确认 | P0/P1 |
| 数据埋点 | 事件采集、漏斗、行为日志 | 无统一页面 | 未发现统一 analytics 工具或接口 | 未完成 | 未接入 | 本地浏览/搜索记录 | 不完整 | 没有统一埋点事件、漏斗、错误上报 | P2 |
| 隐私合规 | 隐私页、微信隐私授权 | `miniprogram/pages/privacy/privacy` | `privacy.js`, `privacy.wxml`, `docs/wechat-privacy-backend-guide.md` | 已开发 | 不涉及接口 | 无 | 基本可用 | AI、录音、简历、支付说明需与实际上线功能保持一致 | P1 |
| 大厂投递 | BigTech Jobs 加 apply form | `miniprogram/package-content/pages/bigtech-jobs`, `miniprogram/package-user/pages/apply-form` | `bigtech-jobs.js`, `apply-form.js`, `routes/apply.js` | 已开发但隐藏 | 已接入部分 | 有固定公司列表 | 不适合 V1.1 主入口 | 页面无入口，能力复杂，建议后置 | P3 |

## 3. 未完成内容与上线风险

| 问题 | 文件路径 | 具体位置 | 对用户的影响 | 修改建议 | 优先级 | 是否影响上线 |
| -- | ---- | ---- | ------ | ---- | --- | ------ |
| 生产环境配置疑似不完整 | `.env`, `server.js`, `ecosystem.config.cjs` | 缺少或需确认 `WEBHOOK_SECRET`、微信支付配置、`PAYMENT_ENABLED` | 生产启动可能失败，或支付配置不确定 | 上线环境明确补齐，未开支付则设置关闭支付 | P0 | 是 |
| JWT 密钥看起来仍带占位语义 | `.env`, `middleware/auth.js` | `JWT_SECRET` 类似 change-in-production 文案 | 账号安全风险 | 换成随机高强度密钥并重启服务 | P0 | 是 |
| 后台管理员密码偏弱 | `.env`, `routes/admin/auth.js` | `ADMIN_PASSWORD` 长度 8 | 后台被撞库风险 | 上线前更换强密码并确认账号权限 | P0 | 是 |
| 通用外链 webview 风险 | `miniprogram/package-content/pages/webview`, `job-detail.js` | 任意投递链接可能进入 webview | 微信业务域名未配置会打不开，也可能影响审核 | V1.1 改为复制链接/提示浏览器，或仅允许白名单域名 | P0 | 是 |
| 主投递链路不是真投递闭环 | `job-detail.js`, `applications.js`, `apply-form.js` | “一键投递”主要写本地记录 | 用户以为已投递，实际只是记录 | 文案改为“保存投递记录/复制投递链接”，真投递放 V1.2+ | P1 | 是，影响体验 |
| 收藏未从服务端恢复 | `miniprogram/utils/favorites.js`, `favorites.js`, `routes/favorites.js` | 页面读取本地收藏 | 换设备或清缓存后丢失 | 登录后拉取服务端收藏并合并 | P1 | 建议修 |
| 浏览记录无完整页面 | `job-detail.js`, `profile.js` | `jobBrowseHistory` 和 `viewHistory` 混用 | 用户中心统计不准，无法查看历史 | 统一 key，增加或隐藏浏览记录入口 | P1 | 建议修 |
| 订阅消息模板为空 | `miniprogram/utils/app-config.js`, `campus-detail.js` | `SUBSCRIBE_TEMPLATE_IDS` 为空 | 校招提醒无法真正触达 | 未配置前隐藏“提醒/订阅”强承诺 | P1 | 建议修 |
| VIP 页面展示价格但不可支付 | `vip.js`, `routes/payment.js` | `handlePay()` 仅展示说明，真实支付 return | 用户困惑，审核也可能关注支付声明 | V1.1 改为权益说明页或隐藏购买按钮 | P1 | 建议修 |
| AI 功能入口过多 | `index.js`, `vip.js`, `miniprogram/package-ai/*`, `miniprogram/package-career/*` | 首页、会员页、工具页多个 AI 入口 | V1.1 范围过重，失败点多 | V1.1 只保留 1 个轻量 AI 入口或暂隐藏 | P1 | 建议修 |
| 聚合职位表为空 | `db/jobapp.db`, `routes/aggregate.js` | `aggregated_jobs` 当前 0 条 | 外部接口失败时列表弱 | 上线前跑聚合任务或补足本地岗位数据 | P1 | 建议修 |
| fallback 岗位仅 18 条 | `data/jobs.json`, `scripts/check-data-content.js` | 检查警告建议至少 80 条 | 空状态和推荐内容不足 | 补充上线可用岗位库 | P1 | 建议修 |
| 缺少统一埋点 | 全局 | 未发现 analytics/report 接口 | 无法判断转化漏斗和问题页面 | 增加最小埋点：曝光、搜索、详情、收藏、投递、反馈 | P2 | 不阻断 |
| 调试日志较多 | `miniprogram/app.js`, `admin/banners.html`, `routes/payment.js` 等 | `console.log` | 暴露 userId 或污染日志 | 去掉前端生产日志，后端改分级日志 | P2 | 不阻断 |
| 未使用组件 | `components/c-action-bar`, `c-ai-loading`, `c-search-bar`, `c-section-card` | 未发现引用 | 增加维护成本 | 上线后清理或补使用 | P3 | 否 |
| 客服入口不完整 | `feedback`, `about`, `settings` | 未发现原生客服按钮 | 用户无法即时咨询 | V1.1 保留反馈加邮箱，V1.2 接客服 | P2 | 否 |
| 隐私说明与开放功能需对齐 | `privacy.wxml`, `docs/wechat-privacy-backend-guide.md` | AI、录音、支付、简历均有声明 | 若隐藏功能未同步说明，审核和信任风险 | 上线前按实际展示功能复核微信后台隐私指引 | P1 | 是 |

## 4. 核心用户链路检查

### 4.1 路径 1：找岗位

用户进入小程序，浏览首页，进入职位列表，搜索或筛选，查看职位详情，收藏岗位或跳转投递，返回继续浏览。

| 检查项 | 结论 |
| --- | --- |
| 是否完整 | 基本完整，但投递不闭环 |
| 缺少页面 | 独立浏览记录页 |
| 缺少接口 | 收藏拉取、统一埋点、真实投递状态同步 |
| 断点 | 外链投递/webview、聚合数据为空 |
| 重复功能 | `searchHistory/jobSearchHistory`、`viewHistory/jobBrowseHistory` |
| 是否适合 V1.1 | 适合作为核心，但需先修 P0/P1 |
| 建议隐藏 | 真投递、BigTech 自动申请、任意外链 webview |

### 4.2 路径 2：校招信息

用户进入小程序，查看校招日历，查看招聘节点，查看职位或公司详情，收藏或咨询。

| 检查项 | 结论 |
| --- | --- |
| 是否完整 | 基本完整 |
| 缺少页面 | 无明显缺页 |
| 缺少接口 | 订阅消息模板未配置 |
| 断点 | 提醒能力不完整 |
| 重复功能 | 收藏/订阅状态偏本地 |
| 是否适合 V1.1 | 可以上线，但弱化提醒承诺 |
| 建议隐藏 | 订阅提醒强入口 |

### 4.3 路径 3：AI 求职工具

用户进入 AI 工具，上传简历或填写背景，输入目标岗位，获得分析结果，保存结果，获得下一步建议，引导继续使用或咨询。

| 检查项 | 结论 |
| --- | --- |
| 是否完整 | 不适合作为 V1.1 主链路 |
| 缺少页面 | 统一 AI 结果页、云端历史页、权益说明页 |
| 缺少接口 | AI 结果持久化、额度/会员统一判断、咨询承接 |
| 断点 | 用户从结果保存到下一步建议的闭环不稳 |
| 重复功能 | AI 助手、面试、项目、ATS、Daily brief 分散 |
| 是否适合 V1.1 | 不建议全量上线 |
| 建议隐藏 | Daily brief、ATS、Networking、OA、Agent 类入口 |

### 4.4 路径 4：用户中心

微信登录，完善资料，上传简历，查看收藏，查看浏览记录，查看使用记录，联系客服。

| 检查项 | 结论 |
| --- | --- |
| 是否完整 | 基本可用但统计不准 |
| 缺少页面 | 浏览记录页、使用记录页 |
| 缺少接口 | 统计汇总接口、收藏恢复接口 |
| 断点 | 清缓存后数据缺失 |
| 重复功能 | 本地和服务端记录混用 |
| 是否适合 V1.1 | 可保留简版 |
| 建议隐藏 | 会员购买、复杂使用记录 |

## 5. V1.1 上线判断

### 5.1 当前是否建议上线

不建议直接上线。建议先完成 P0 和核心 P1 修复，再上线一个收敛版 V1.1。

### 5.2 上线前必须修复

| 优先级 | 事项 |
| --- | --- |
| P0 | 生产环境变量补齐和安全加固 |
| P0 | 通用 webview 外链风险处理 |
| P0 | 微信审核相关配置和隐私声明复核 |
| P1 | 投递文案和真实行为对齐 |
| P1 | 收藏服务端恢复 |
| P1 | 浏览记录 key 统一 |
| P1 | VIP 购买入口隐藏或改成权益说明 |
| P1 | AI 高级入口收敛 |
| P1 | 校招提醒模板未配置时降级 |
| P1 | 岗位数据兜底补足 |

### 5.3 可以暂时隐藏的页面

| 页面或功能 | 原因 |
| --- | --- |
| `miniprogram/package-content/pages/bigtech-jobs` | 入口隐藏，能力复杂，非 V1.1 必需 |
| `miniprogram/package-user/pages/apply-form` | 真投递表单链路未进入主流程 |
| `miniprogram/package-user/pages/vip` 的购买按钮 | 支付未开放 |
| `miniprogram/package-ai/pages/daily-brief` | Agent 化能力，适合 V2.0 |
| `miniprogram/package-career/pages/ats-optimize` | 适合 V1.5 AI 工具版 |
| `miniprogram/package-career/pages/networking` | 当前版本过重 |
| `miniprogram/package-career/pages/oa-bank` | 题库内容可后置 |
| `miniprogram/package-career/pages/skill-pathways` | 当前版本非核心 |
| 订阅提醒强入口 | 模板 ID 未配置 |

### 5.4 可以延后开发的功能

| 功能 | 建议版本 |
| --- | --- |
| 真投递自动填表 | V1.2 或 V1.5 |
| 会员支付 | 支付配置和权益验证稳定后再开 |
| AI 简历诊断、JD 匹配、面试准备 | V1.5 |
| 求职周计划、截止日期提醒、连续 Agent | V2.0 |
| 复杂题库、Networking、Skill Pathway | V1.5+ |
| 完整数据看板和增长分析 | V1.2 |

### 5.5 建议保留的最小可用版本

| 模块 | 保留范围 |
| --- | --- |
| 首页 | Banner、推荐岗位、校招/资讯入口、简历入口、反馈入口 |
| 岗位 | 列表、搜索、筛选、详情、收藏、复制投递链接、保存投递记录 |
| 用户 | 登录、资料、简历上传、收藏、投递记录、反馈、隐私政策 |
| 校招 | 日历列表、详情、公司/岗位信息、收藏 |
| 资讯 | 资讯列表、详情 |
| 后台 | 岗位、校招、资讯、Banner、用户、反馈管理 |

## 6. 后续版本规划

| 版本 | 核心目标 | 必做功能 | 暂缓功能 | 前端任务 | 后端任务 | AI 任务 | 预计工作量 | 验收标准 |
| -- | ---- | ---- | ---- | ---- | ---- | ----- | ----- | ---- |
| V1.1 | 上线前修复版 | 跑通找岗位闭环、修 P0/P1、隐藏过重入口 | 真投递、支付、Agent、复杂 AI | 收敛入口、修文案、统一历史/收藏 | 环境加固、收藏恢复、岗位数据兜底 | 最多保留轻量问答入口 | 3-5 天 | 核心路径无断点，微信审核风险清零 |
| V1.2 | 核心体验优化版 | 搜索筛选、收藏同步、校招日历、专题内容、反馈、埋点 | 复杂 AI Agent | 优化筛选、空状态、历史页、专题页 | 增加统计接口、埋点接口、内容管理 | AI 仅做局部辅助 | 1-2 周 | 有漏斗数据，找岗位体验稳定 |
| V1.5 | AI 工具版 | 简历诊断、JD 匹配、面试准备 | 自动投递 Agent、周计划 | 统一 AI 工具入口、结果页、历史页 | AI 记录保存、额度/会员边界 | Prompt、结果结构化、简历/JD 分析 | 2-3 周 | 用户能上传/输入/获得可保存结果 |
| V2.0 | AI 求职 Agent 版 | 岗位推荐、投递进度、截止提醒、周计划、阶段建议 | 非核心社交/社区功能 | Agent 工作台、提醒、任务流 | 用户画像、任务、通知、进度模型 | 多步规划、推荐、复盘 | 4-6 周 | AI 能连续服务一个求职周期 |

## 7. 可直接执行的开发任务清单

| 序号 | 任务名称 | 所属模块 | 文件路径 | 具体修改内容 | 前端工作 | 后端工作 | AI 工作 | 优先级 | 工作量 | 验收标准 |
| -- | ---- | ---- | ---- | ------ | ---- | ---- | ----- | --- | --- | ---- |
| 1 | 修复生产配置风险 | 部署/安全 | `.env`, `server.js`, `ecosystem.config.cjs` | 补齐/确认生产变量、强密钥、支付开关 | 无 | 配置校验 | 无 | P0 | 0.5 天 | 生产启动不报错 |
| 2 | 处理外链投递风险 | 投递 | `job-detail.js`, `webview.js` | V1.1 改复制链接/白名单跳转 | 修改投递弹窗和按钮 | 可选记录投递意向 | 无 | P0 | 0.5 天 | 无任意外链 webview |
| 3 | 收敛 V1.1 入口 | 首页/导航 | `index.js`, `vip.js`, 相关 WXML | 隐藏 BigTech、复杂 AI、未开放支付入口 | 调整入口展示 | 无 | 无 | P1 | 0.5 天 | 首页只露可用功能 |
| 4 | 修正投递文案与状态 | 职位详情/投递 | `job-detail.js`, `applications.js` | “一键投递”改为“保存投递/复制链接” | 改文案、toast、状态 | 同步投递记录接口 | 无 | P1 | 1 天 | 用户不会误解已完成投递 |
| 5 | 收藏服务端恢复 | 收藏 | `utils/favorites.js`, `favorites.js`, `routes/favorites.js` | 登录后拉取并合并收藏 | 页面加载恢复 | 补/确认列表接口 | 无 | P1 | 1 天 | 换设备登录能看到收藏 |
| 6 | 统一浏览历史 | 用户中心 | `job-detail.js`, `profile.js`, `settings.js` | 统一 `jobBrowseHistory/viewHistory` | 统计准确或入口隐藏 | 可后置服务端记录 | 无 | P1 | 0.5 天 | 用户中心浏览数准确 |
| 7 | 校招提醒降级处理 | 校招 | `campus-detail.js`, `app-config.js` | 模板未配置时隐藏订阅承诺 | 改按钮/提示 | 无 | 无 | P1 | 0.5 天 | 不出现不可用提醒 |
| 8 | 补足岗位兜底数据 | 岗位数据 | `data/jobs.json`, 聚合任务 | 至少补到上线可用量 | 无 | 跑聚合/导入 | 无 | P1 | 1-2 天 | 接口失败时仍有可浏览岗位 |
| 9 | 去除前端生产调试日志 | 质量 | `app.js`, `admin/banners.html` 等 | 清理敏感 `console.log` | 清日志 | 后端改分级日志 | 无 | P2 | 0.5 天 | 不打印 userId 等敏感信息 |
| 10 | 增加最小埋点 | 数据 | `utils/analytics.js`, 新 route | 搜索、详情、收藏、投递、反馈事件 | 接入关键页面 | 新增事件接口/表 | 无 | P2 | 1-2 天 | 后台能看到核心漏斗 |
| 11 | AI V1.5 入口重构 | AI | `package-ai/*`, `package-career/*` | 统一入口、结果保存、历史记录 | 结果页/历史页 | AI 记录接口 | 结构化 Prompt | P3 | 2-3 周 | AI 工具形成闭环 |

## 8. 建议执行顺序

后续开发建议严格按以下顺序推进，每组完成后单独验证并等待确认：

1. P0 问题：生产配置、安全、外链投递和微信审核风险。
2. P1 问题：入口收敛、投递文案、收藏恢复、浏览记录、校招提醒、岗位兜底。
3. 核心链路：找岗位、收藏、保存投递记录、简历上传、反馈。
4. 埋点：搜索、详情、收藏、投递、反馈、登录。
5. V1.2 功能：搜索体验、校招专题、内容专题、反馈闭环。
6. AI 功能：简历诊断、JD 匹配、面试准备，再进入 Agent 化。

## 9. 每组修改后的交付格式

每完成一组修改，应输出：

| 项目 | 内容 |
| --- | --- |
| 修改文件 | 列出具体文件 |
| 解决问题 | 对应 P0/P1/P2 编号和原因 |
| 影响范围 | 是否影响其他页面或接口 |
| 测试步骤 | 小程序路径、接口路径、后台路径 |
| 验收结论 | 是否通过，是否需要继续修 |
