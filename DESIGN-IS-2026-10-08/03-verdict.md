# Verdict

## REDESIGN — product experience architecture

当前体验得分 **11/30**，应重设计用户可见的信息架构和任务流：保留岗位、申请、简历、面试、计划、Today、确认写入与商业账本等核心能力，但停止让用户理解和选择完整工具地图。

这不是推倒重写后端，也不是把全部能力删除；它是从“工具优先”转成“对象和下一步优先”。旧页面先作为兼容入口存在，新的核心流程稳定并观察 4–8 周后再决定重定向、隐藏或下线。

## Highest-leverage moves

1. **Principle #2/#4 — Useful and understandable:** 把“岗位/申请”设为主对象，每份申请只突出一个当前下一步；简历、匹配、材料、OA、面试和跟进都作为申请内的状态与产物，不再让用户先挑工具。证据：`01-evidence.md#11-product-scale-and-navigation`、`docs/PRODUCT_COMPLEXITY_RESEARCH_20260914.md:67-89`。
2. **Principle #10 — As little design as possible:** 合并为一个上下文 AI 入口；四位专家保留为内部路由，不再让用户选择 Agent，同时移除全局浮动 AI、资源页双 AI 入口、助手 8 工具和 5 欢迎入口的重复暴露。证据：`01-evidence.md#13-depth-and-repeated-affordances`。
3. **Principle #6 — Honest:** 删除人为抬高的匹配百分比、硬编码最近对话、伪思考阶段和无证据“精选/精准/真题”表述；改为证据型标签、真实来源和可解释信心。证据：`01-evidence.md#32-inflated-or-unsupported-claims`、`#33-label-to-behavior-mismatches`。
4. **Principle #2/#8 — Useful and thorough:** 建立统一 AI 行动协议：AI 可自动读取上下文、生成草稿和推荐下一步；写入时按钮必须说明具体变化并由用户一次确认；投递、外发消息、支付、退款、删除等外部或高风险动作继续手动。证据：`01-evidence.md#4-ai-operation-boundary`。
5. **Principle #3/#5/#9 — Aesthetic, unobtrusive and efficient:** 首页只保留“今日下一步、临近截止、最多 3 个岗位推荐和申请摘要”；取消 autoplay、持续漂浮动效、默认假未读和关闭态会员推广，并收敛 spacing、字号和颜色 token。证据：`01-evidence.md#2-visual-evidence`、`#5-weight-and-friction`。

## Preserve

- 五个用户语言一级入口及其核心对象语义：`miniprogram/app.json:107-145`。
- 首页 Today 卡和单一主行动：`miniprogram/components/home-career-plan/home-career-plan.wxml:1-33`。
- 申请卡的“下一步行动”和状态推进：`miniprogram/pages/applications/applications.wxml:79-101`。
- V4 Agent 有限上下文、脱敏、confirmation token 和可审计写入：`services/v4Agents.js:18-21,68-123`。
- 简历和申请材料“先生成草稿、确认后写入新版本”的安全模式：`routes/v4/resumes.js:230-291`、`routes/v4/materials.js:188-288`。
- 现有全局品牌色与基础设计 token，但需减少页面内直接色值：`miniprogram/app.wxss:2-69`。

## Discard from the core path

- 工具目录作为用户主要心智模型。证据：资源中心 29 个入口，`miniprogram/pages/resources/resources.js:4-79`。
- 让用户先选择四位 AI 专家的流程。证据：`miniprogram/pages/ai-career/ai-career.wxml:41-96`。
- 同一功能在首页、资源、AI 欢迎区、AI 抽屉和浮钮重复出现。证据：`01-evidence.md#13-depth-and-repeated-affordances`。
- 自动轮播、持续漂浮 AI、假未读和关闭态会员推广等与当前任务无关的竞争元素。证据：`01-evidence.md#5-weight-and-friction`。
- 不可兑现或行为不匹配的“搜索聊天、最近对话、保存”等表面功能。证据：`01-evidence.md#33-label-to-behavior-mismatches`。
