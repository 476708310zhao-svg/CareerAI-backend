# 首页 AI 求职工作台优化方案（参考图 UI 重做版）

更新时间：2026-07-16

适用工程：`C:\Users\admin\Desktop\求职小程序\jobapp-server`

## 1. 当前项目结论

- 技术栈：原生微信小程序，WXML / WXSS / JavaScript，后端为 Node.js + Express。
- 当前首页：`miniprogram/pages/index/index`。
- 当前首页约 50 KB JavaScript、15 KB WXML、41 KB WXSS，页面职责过多。
- V4 一级 TabBar 已调整为“Today / Jobs / Progress / AI Career / Profile”。
- AI Career 是统一工作台；按产品要求继续保留全局 AI 悬浮入口，快速直达通用 AI 助手。
- 现有职位、校招、企业、资讯、Banner、求职进度和用户画像接口均可复用。

## 2. 当前首页主要问题

| 当前模块 | 问题 | 处理 |
|---|---|---|
| 今日求职工作台 | 同时包含状态、四个操作入口，且与下方每日进度重复 | 精简为唯一“今日求职计划” |
| Banner | 原位置具备运营曝光价值 | 保留在核心工具下方，复用缓存、真实接口和轮播交互 |
| 10 宫格 | 与 TabBar、求职计划和 AI Career 重复 | 从首页移除，不删除业务页面 |
| 今日求职简报 | 与今日求职工作台重复 | 合并到今日求职计划 |
| 今日校招信息更新 | 原长列表影响首屏，但它是核心求职机会入口 | 首页保留精选：1 条重点 + 最多 2 条更新，完整内容进入校招页面 |
| 会员权益 | 需要稳定的首页曝光，同时不能误导未开放支付 | 保留紧凑横幅；会员开关关闭时明确显示真实微信支付暂未开放 |
| 热门企业 | 与职位页企业库重复 | 移至“职位”相关页面 |
| 今日热门 | 价值表达偏平台热门 | 改为“为你推荐”，最多 3 条 |
| 求职快讯 | 条数偏多、层级弱 | 改为“求职情报”，首页最多 2 条 |

## 3. 最终首页结构

```text
职位搜索
↓
今日求职计划
↓
4 个核心求职工具
↓
会员权益横幅
↓
Banner 轮播
↓
为你推荐（最多 3 个岗位）
↓
今日校招信息更新（1 条重点 + 最多 2 条更新）
↓
求职情报（最多 2 条）
↓
AI Career 统一入口
↓
Today / Jobs / Applications / AI Career / Profile
```

目标是在保留搜索与运营 Banner 的同时控制信息密度，让用户快速知道当前状态和下一步行动。

## 4. 组件设计

新增以下首页专用组件：

- `home-career-plan`：用户状态、四项关键指标、今日建议和主行动。
- `home-core-tools`：JD 匹配、简历优化、投递追踪、AI 模拟面试。
- `home-campus-updates`：今日校招重点机会、最新更新及完整校招入口。
- `home-recommended-jobs`：推荐岗位的 loading / empty / error / list。
- `home-career-insights`：求职情报的 loading / empty / error / list。

继续复用：

- `c-company-logo`
- V4 自定义 TabBar、全局 AI 悬浮入口与 AI Career 一级入口
- 当前导航工具、功能开关、职位推荐、资讯和求职进度工具

## 5. 数据来源

| 首页内容 | 数据来源 |
|---|---|
| 登录与用户画像 | `userProfile`、token、本地求职档案 |
| Banner | `/api/banners` 与 `cachedBanners_v2` 本地缓存，接口失败显示运营兜底 |
| 最近 ATS | `onlineResume`、`jdMatchReports` |
| 推荐岗位 | `getAggregatedJobs`，首页最多保留 3 条 |
| 待投递 / 待面试 / 进行中 | `utils/job-progress.js` |
| 今日建议 | `utils/daily-tasks.js` 首屏生成，登录后通过 `/api/v4/today/tasks/sync` 与 `today_tasks_v4` 合并 |
| 今日校招 | `getCampusList` 与本地缓存，首页展示 1 条重点 + 最多 2 条更新 |
| 求职情报 | `getNews`，首页最多保留 2 条 |

首页恢复 Banner 缓存与静默刷新，不再发起热门企业请求；校招优先读取缓存并延迟刷新，避免阻塞首屏。

## 6. 路由复用

| 功能 | 路由 |
|---|---|
| 职位搜索 | `/package-user/pages/search/search` |
| JD 岗位匹配 | `/package-ai/pages/jd-match/jd-match` |
| 简历优化 | `/package-career/pages/ats-optimize/ats-optimize` |
| 投递追踪 | `/package-user/pages/job-progress/job-progress` |
| AI 模拟面试 | `/package-ai/pages/interview-setup/interview-setup` |
| 推荐岗位列表 | `/pages/jobs/jobs` |
| 机构测评页面 | `/pages/agencies/agencies` |
| 求职情报列表 | `/package-content/pages/news/news` |
| AI 助手 | `/package-ai/pages/ai-assistant/ai-assistant` |

## 7. 开发步骤

1. 新增首页五个展示组件。
2. 重写首页 WXML，使页面只承担编排和路由。
3. 精简首页 WXSS，并将模块样式收敛到组件。
4. 将首页岗位限制为最多 3 条、求职情报限制为最多 2 条。
5. 保留顶部搜索框和 Banner 轮播，停止热门企业的首页请求；保留校招缓存与延迟加载。
6. 为岗位与资讯补齐独立 loading / empty / error / retry。
7. 将一级导航调整为 Today、Jobs、Progress、AI Career、Profile，并迁移旧 switchTab 跳转。
8. 保留全局 AI 悬浮入口，并在首页恢复受功能开关保护的会员权益横幅。
9. 执行小程序静态检查、后端测试和微信开发者工具验收。

## 8. 验收标准

- 首页顶部保留搜索框和 Banner，Banner 支持真实接口、缓存、轮播、失败兜底和点击跳转。
- 首页不再出现 10 宫格、校招长列表和热门企业；会员权益以紧凑横幅呈现。
- 今日求职计划是首页唯一求职状态模块。
- 四个核心工具均可进入现有真实页面。
- 今日校招展示真实接口数据，支持进入详情、校招日历和完整列表。
- 推荐岗位不超过 3 条，求职情报不超过 2 条。
- 单个接口失败不会导致首页白屏。
- Progress 与 AI Career 为可直接使用的主包页面，五项 TabBar 跳转正常。
- 全局 AI 悬浮入口可直达通用 AI 助手；会员横幅在开关关闭时不进入支付链路。
- 首页底部留白覆盖自定义 TabBar 和安全区。
- `npm run check:miniprogram`、`npm test` 通过。

## 9. 2026-07-16 实施结果

- 首页 WXML 从 333 行收敛为组件编排结构。
- 首页 WXSS 从 2071 行收敛为 146 行页面级样式，其余视觉由组件维护。
- 已移除首页 10 宫格、重复简报和热门企业展示，并将校招长列表收敛为精选核心模块；会员权益改为紧凑横幅。
- 顶部保留原搜索框，Banner 调整至核心工具之后，并复用真实接口、缓存、图片失败兜底和原点击路由。
- 首页请求 Banner、推荐岗位、求职情报与校招精选；各模块均限制首屏数据量。
- 首页按参考图重做为白底、浅蓝描边、低阴影、紧凑行高与蓝绿状态色的统一视觉语言。
- 推荐岗位、今日校招和求职情报均改为单卡多行结构，减少重复大卡片并提升信息扫描效率。
- 新增岗位与情报的独立 loading / empty / error / retry 状态。
- 登录用户的首页任务已与服务端 Today 任务幂等合并；未登录或弱网时继续使用本地任务。
- 本地完成状态支持离线保存和联网补传，服务端 AI/面试任务不会被首页同步删除。
- V4 一级导航已落地；岗位 Tab 当前直接承载校招日历，原岗位推荐保留为二级页面，测评和题库继续作为普通业务页面。
- 新增 Progress 主包求职进度工作台与 AI Career 四 Agent 主包入口。
- 按产品要求恢复全局 AI 悬浮入口；会员开关关闭时横幅仍保留，但明确提示真实微信支付未开放。
- 验证：`npm test` 85/85 通过，`npm run check:miniprogram` 通过，主包估算约 0.95 MB。
- 此前首页版本已通过微信开发者工具 `preview`；新导航仍需在最终真实 E2E 中复验。
