# Consolidated evidence

本文件只记录事实，不评分。运行时未启动，因此所有性能、焦点和可访问性判断均按静态证据标记。

## 1. Structural evidence

### 1.1 Product scale and navigation

- 小程序注册 10 个主包页面和 5 个分包、44 个分包页面；一级导航固定为“首页、找岗位、进度、资源中心、我的”。证据：`miniprogram/app.json:2-12,19-96,107-145`。
- 一级导航之外，每个 Tab 还持久显示一个悬浮 AI 入口；运行时形成 5 个 Tab + 1 个 AI 动作。证据：`miniprogram/custom-tab-bar/index.wxml:1-38`、`miniprogram/custom-tab-bar/index.js:4-36,116-131`。
- 资源中心配置 5 个阶段、23 个工具、4 个内容服务，再加顶部“AI 专家”和“专项咨询”，共 29 个入口。证据：`miniprogram/pages/resources/resources.js:4-79`、`miniprogram/pages/resources/resources.wxml:7-54`。

### 1.2 Interactive-element count

静态方法：原生表单控件和带 `bind/catch` 交互的节点各计一次；循环节点只按源码声明计数；组件展开只计算一层直接引用。

| 表面 | 页面直接声明 | 展开一层组件 |
|---|---:|---:|
| 首页 | 4 | 14 |
| 找岗位 | 33 | 48 |
| 进度 | 19 | 30 |
| 资源中心 | 5 | 5 |
| 我的 | 10 | 21 |
| AI 专家 | 17 | 28 |
| AI 助手 | 29 | 40 |
| 合计 | 117 | 186 |

关键证据：`miniprogram/pages/index/index.wxml:2-58`、`miniprogram/pages/jobs/jobs.wxml:11-228`、`miniprogram/pages/applications/applications.wxml:7-121`、`miniprogram/pages/resources/resources.wxml:8-48`、`miniprogram/pages/profile/profile.wxml:5-92`、`miniprogram/pages/ai-career/ai-career.wxml:47-120`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.wxml:7-372`。

### 1.3 Depth and repeated affordances

- 直接 WXML 树最大深度为 10，出现在首页 Banner 和 AI 助手消息/思考状态。证据：`miniprogram/pages/index/index.wxml:1-25`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.wxml:81-125`。
- 三组入口配置中至少存在 14 个重复目的簇、39 个入口声明，相对每个目的保留一个入口形成 25 个额外声明。重复目的包括模拟面试、项目复盘、JD 匹配、校招日历、ATS、求职规划、简历、语音复盘、申请进度、AI 助手、面试题库、薪酬、机构测评和 AI 历史。证据：`miniprogram/pages/index/index.js:26-68,372-374`、`miniprogram/pages/resources/resources.js:12-78`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.js:278-293`。
- AI 助手欢迎区的 5 项能力在抽屉工具中再次出现。证据：`miniprogram/package-ai/pages/ai-assistant/ai-assistant.js:278-293`。
- 67 个静态 `require` 绑定未发现 unused import；完整 dead-prop 数未知。首页 `features` 与 `aiSpotlight` 仍在 JS 中维护，但当前 WXML 不渲染。证据：`miniprogram/pages/index/index.js:26-69,202-236`、`miniprogram/pages/index/index.wxml:1-85`。

## 2. Visual evidence

以下计数来自审计核心页面及组件 WXSS，`rpx` 按 375 CSS px 视口折算。

- Spacing scale：45 个正值，从 0.5px 到 95px；大值部分为底部安全区。证据示例：`miniprogram/pages/applications/applications.wxss:21`、`miniprogram/pages/profile/profile.wxss:23`、`miniprogram/pages/jobs/jobs.wxss:1012`。
- Type scale：30 个字号，从 6px 到 41px。证据示例：`miniprogram/components/home-recommended-jobs/home-recommended-jobs.wxss:132`、`miniprogram/pages/index/index.wxss:236`。
- 核心样式文件中有 355 个唯一 hex literal，以及 60 个颜色/渐变/阴影 token。全局 token 见 `miniprogram/app.wxss:2-69`，页面仍大量直接写色值。
- 未渲染运行时页面，最低对比度无法可靠测量。

### 2.1 UI state coverage

| 状态 | 事实 |
|---|---|
| Empty | 首页推荐、校招、岗位、进度、AI 历史均有空态。证据：`home-recommended-jobs.wxml:70-77`、`home-campus-updates.wxml:65-71`、`jobs.wxml:230-235`、`applications.wxml:71-75`、`ai-career.wxml:102`。 |
| Loading | 核心列表、进度、AI Career、AI 助手有骨架或 spinner。证据：`home-recommended-jobs.wxml:10-21`、`jobs.wxml:250-270`、`applications.wxml:30-34`、`ai-career.wxml:29`、`ai-assistant.wxml:108-125`。 |
| Error | 多数核心页有错误和重试；首页校招失败会落入空态，无专用错误态。证据：`applications.wxml:42-47`、`ai-career.wxml:30`、`ai-assistant.wxml:128-136`、`miniprogram/pages/index/index.js:756-765`。 |
| Success | 主要通过 toast 或结果内容表达。证据：`miniprogram/pages/applications/applications.js:236,321`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.js:655,663,722,738`。 |
| Focus | 未发现 `:focus`、`focus-class` 或 focused visual selector；输入 focus handler 只滚动页面。证据：`ai-assistant.wxml:241-257`、`ai-assistant.js:489-495`。 |
| Disabled | 原生 disabled 和自绘 `.disabled` 并存；部分自绘控件仍保留点击绑定。证据：`applications.wxml:100`、`ai-career.wxml:92,96`、`ai-assistant.wxml:309-315,354-355`。 |

## 3. Copy, clarity and honesty

### 3.1 Terminology load

- 核心页面同时暴露 `AI CAREER OS`、Agent、JD、ATS、OA、STAR、Networking Copilot、Sponsor、OPT、Today 等内部或行业术语。证据：`miniprogram/pages/ai-career/ai-career.wxml:9-13`、`miniprogram/pages/resources/resources.js:12-69`、`miniprogram/pages/jobs/jobs.wxml:108-148`。
- AI Career 要求用户先选 4 个专家，再选申请上下文，再输入问题，再决定是否允许写入。证据：`miniprogram/pages/ai-career/ai-career.wxml:41-96`。
- 现有产品研究已经提出“一个 AI 入口、四种内部上下文”，用户不需要先理解四个产品。证据：`docs/PRODUCT_COMPLEXITY_RESEARCH_20260914.md:85-89`。

### 3.2 Inflated or unsupported claims

- 首页“匹配度”把关键词命中映射为 75–98%，注释说明用于制造 Aha Moment，不是经结果数据校准的成功概率。证据：`miniprogram/pages/index/index.js:624-638`、`miniprogram/components/home-recommended-jobs/home-recommended-jobs.wxml:62-65`。
- “完善目标后获得精准推荐”对应的是标题、公司和描述的关键词包含计分。证据：`home-recommended-jobs.wxml:72-73`、`miniprogram/utils/matcher.js:75-125`。
- “精选岗位”当前没有独立精选逻辑；普通路径展示聚合结果。证据：`miniprogram/pages/jobs/jobs.wxml:78`、`miniprogram/pages/jobs/jobs.js:438-459`。
- AI system persona 声称“深度了解知名企业招聘偏好”“曾帮助大量留学生拿到理想 Offer”，仓库无对应证据。证据：`routes/ai.js:105-123`。
- “CareerGPT 正在思考”展示三个固定阶段，实际运行状态只有等待首 token 和 streaming。证据：`ai-assistant.wxml:113-123`、`ai-assistant.js:786-848`。

### 3.3 Label-to-behavior mismatches

- “最近对话”是 3 条硬编码样例，点击仅关闭抽屉，不加载会话。证据：`ai-assistant.js:295-298`、`ai-assistant.wxml:66-75`。
- “搜索聊天”是无 input、无事件的静态 `view`。证据：`ai-assistant.wxml:40-43`。
- “保存”只写本机 `ai_assistant_saved_results`，产品内无读取入口。证据：`ai-assistant.wxml:163-166`、`ai-assistant.js:726-738`。
- “新对话”会清空缓存，历史不会保留；页面初始化也主动删除缓存。证据：`ai-assistant.wxml:36-39`、`ai-assistant.js:459-464,691-707`。
- “AI 历史｜查看已有对话与报告”目标页实际读取面试、错题和语音历史，不读取助手对话。证据：`resources.js:75`、`miniprogram/package-ai/pages/ai-history/ai-history.js:26-90`。
- “从选岗到面试，按当前进度给出下一步”实际仍需手动选择专家、上下文和问题。证据：`ai-career.wxml:10-11,41-96`、`ai-career.js:214-231`。
- 文档写明首页已移除会员权益横幅，当前运行源仍显示关闭态横幅。证据：`docs/V5_P0_MOBILE_WORKFLOW_20260915.md:9`、`miniprogram/pages/index/index.wxml:42-58`。

## 4. AI operation boundary

### 4.1 Existing strengths

- V4 Agent 只读取有限画像和当前申请快照，输入深度脱敏。证据：`services/v4Agents.js:18-21,93-102`、`services/v4AiRuntime.js:17-31`。
- Agent system prompt 明确不能直接执行写操作；请求写入后任务进入 `awaiting_confirmation`。证据：`services/v4Agents.js:68-90`。
- confirmation token 通过后，当前 Agent 只能更新申请 `next_action` 或创建 Today task。证据：`services/v4Agents.js:112-123`。
- 简历优化先生成 change set，确认后保存为新版本；申请材料先生成 pending 草稿，确认后保存。证据：`routes/v4/resumes.js:230-291`、`routes/v4/materials.js:188-288`。

### 4.2 Boundary inconsistencies

- AI Career 的确认按钮写“确认执行写操作”，未说明实际会创建任务还是更新下一步。证据：`ai-career.wxml:117-120`。
- 完成面试训练会自动创建两条 Today task，并可能更新申请 `next_action`；该关联写入没有独立 confirmation token。证据：`services/v4Interview.js:227-246`、`routes/v4/interviews.js:59-66`。
- 通用助手会把姓名、邮箱和经历摘要拼入消息；后端对 `userContext/JD` 脱敏，但直接透传最近 messages，因而 V4 Agent 的“敏感信息会脱敏”不能自然扩展为所有 AI 链路。证据：`ai-assistant.js:430-453`、`routes/ai.js:149-184`。

## 5. Weight and friction

- 初始 JS 原始源码浅层代理值为 73,588 bytes；未包含递归依赖、WXML/WXSS/JSON、图片和微信基础库，真实编译包及 TTI 未知。
- 静态启动图显示 3 类无条件请求：分享配置、feature flags、banner；公开条件请求还包括推荐岗位和校招；登录态再增加 profile、Today sync 和 JD report。证据：`miniprogram/app.js:53-56,66-69`、`miniprogram/pages/index/index.js:157-195,245-255,302-307`。
- 自定义 TabBar AI 浮钮包含 7 个无限动画，首页 swiper 为 1 个 autoplay；审计范围未发现 reduced-motion 处理。证据：`miniprogram/custom-tab-bar/index.wxss:29-117`、`miniprogram/pages/index/index.wxml:8-34`。
- 冷启动无缓存时岗位与校招骨架最多增加 27 个 shimmer 元素。证据：`home-recommended-jobs.wxml:10-21`、`home-campus-updates.wxml:16-25`。
- fresh storage 下首页逻辑会把未读数回退为 3，TabBar 因而显示 badge；全局初始化则是 0。证据：`miniprogram/pages/index/index.js:483-486`、`miniprogram/custom-tab-bar/index.wxml:34`、`miniprogram/app.js:159-162`。

## 6. Accessibility evidence

- 七个表面无 `tabindex`、`auto-focus` 或显式焦点次序；真实微信辅助焦点顺序未知。
- 绝大多数动作是 `<view bindtap>`，未发现键盘替代事件。证据：`applications.wxml:7-121`、`ai-career.wxml:47-120`、`ai-assistant.wxml:7-372`。
- 页面模板共有 15 组显式 `aria-role="button"` + `aria-label`；进度、AI 专家和 AI 助手页面模板为 0。对比：`resources.wxml:8-48`、`profile.wxml:58-92` 与 `applications.wxml:7-121`、`ai-career.wxml:47-120`、`ai-assistant.wxml:7-372`。
- AI 专家自绘开关没有 switch role、checked state 或 aria-label。证据：`ai-career.wxml:92-95`。
- 七个页面和自定义 TabBar 均未发现 skip link。

## 7. Known gaps

- 未启动微信开发者工具或真机；没有实测对比度、触控区域、焦点顺序、读屏朗读、网络请求总数、TTI 或运行时动画数量。
- 入口数按静态声明计算，循环项的实际实例数量更高；feature flag 会改变可见项。
- 视觉 token 计数可能包含未触发或被覆盖样式。
- 未读取线上行为数据，不能据此直接删除低频功能；应先合并入口并观察 4–8 周。
- 本次未覆盖所有 50+ 次级页，也未验证生产 API 返回的动态内容。
