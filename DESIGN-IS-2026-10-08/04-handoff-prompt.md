# /make-plan handoff

```text
/make-plan Redesign 职引微信小程序核心产品体验架构. Current design failed audit at 11/30 with critical gaps in principles #4 understandable, #6 honest, and #10 as little design as possible.

Verdict paragraph:
> 当前体验得分 11/30，应重设计用户可见的信息架构和任务流：保留岗位、申请、简历、面试、计划、Today、确认写入与商业账本等核心能力，但停止让用户理解和选择完整工具地图。

Why redesign and not refine: 总分低于 20，且“as little design as possible”得 0；仅改视觉或隐藏几张卡片无法解决重复对象、重复入口和四 Agent 手动选择造成的结构问题。

Preserve from current design:
- 五个用户语言一级入口及其核心对象语义：miniprogram/app.json:107-145。
- 首页 Today 卡和单一主行动：miniprogram/components/home-career-plan/home-career-plan.wxml:1-33。
- 申请卡的“下一步行动”和状态推进：miniprogram/pages/applications/applications.wxml:79-101。
- V4 Agent 有限上下文、脱敏、confirmation token 和可审计写入：services/v4Agents.js:18-21,68-123。
- 现有全局品牌色与基础设计 token：miniprogram/app.wxss:2-69。

Discard:
- 工具目录作为用户主要心智模型。Evidence: miniprogram/pages/resources/resources.js:4-79。Caused failure on principle #10。
- 让用户先选择四位 AI 专家的流程。Evidence: miniprogram/pages/ai-career/ai-career.wxml:41-96。Caused failure on principles #4 and #10。
- 同一功能在首页、资源、AI 欢迎区、AI 抽屉和浮钮重复出现。Evidence: DESIGN-IS-2026-10-08/01-evidence.md#13-depth-and-repeated-affordances。Caused failure on principle #10。
- 自动轮播、持续漂浮 AI、假未读和关闭态会员推广。Evidence: DESIGN-IS-2026-10-08/01-evidence.md#5-weight-and-friction。Caused failure on principles #5 and #9。

Top moves from the audit:
1. Principle #2/#4 — Useful and understandable: 把“岗位/申请”设为主对象，每份申请只突出一个当前下一步；简历、匹配、材料、OA、面试和跟进都作为申请内的状态与产物，不再让用户先挑工具。Evidence: DESIGN-IS-2026-10-08/01-evidence.md#11-product-scale-and-navigation and docs/PRODUCT_COMPLEXITY_RESEARCH_20260914.md:67-89。
2. Principle #10 — As little design as possible: 合并为一个上下文 AI 入口；四位专家保留为内部路由，不再让用户选择 Agent，同时移除全局浮动 AI、资源页双 AI 入口、助手 8 工具和 5 欢迎入口的重复暴露。Evidence: DESIGN-IS-2026-10-08/01-evidence.md#13-depth-and-repeated-affordances。
3. Principle #6 — Honest: 删除人为抬高的匹配百分比、硬编码最近对话、伪思考阶段和无证据“精选/精准/真题”表述；改为证据型标签、真实来源和可解释信心。Evidence: DESIGN-IS-2026-10-08/01-evidence.md#32-inflated-or-unsupported-claims and #33-label-to-behavior-mismatches。
4. Principle #2/#8 — Useful and thorough: 建立统一 AI 行动协议：AI 可自动读取上下文、生成草稿和推荐下一步；写入时按钮必须说明具体变化并由用户一次确认；投递、外发消息、支付、退款、删除等外部或高风险动作继续手动。Evidence: DESIGN-IS-2026-10-08/01-evidence.md#4-ai-operation-boundary。
5. Principle #3/#5/#9 — Aesthetic, unobtrusive and efficient: 首页只保留“今日下一步、临近截止、最多 3 个岗位推荐和申请摘要”；取消 autoplay、持续漂浮动效、默认假未读和关闭态会员推广，并收敛 spacing、字号和颜色 token。Evidence: DESIGN-IS-2026-10-08/01-evidence.md#2-visual-evidence and #5-weight-and-friction。

Redesign principles in priority order:
1. Principle #2 useful — 用户从岗位或申请出发，在一个页面看见并完成当前下一步。
2. Principle #4 understandable — 不要求用户理解 Agent、ATS、JD、OA、STAR 等内部分类后才能行动。
3. Principle #10 as little design as possible — 每页一个主 CTA，AI 作为后台编排层而不是并列工具目录。
4. Principle #6 honest — 所有分数、标签、历史、AI 阶段和写入行为都与真实实现一一对应。

Deliverables for the plan:
- New information architecture not derived from the old tool catalog.
- New primary flow, low-fi and labeled, compared side-by-side to current: 岗位发现 → 申请对象 → AI 下一步 → 用户确认 → 写回对象。
- A three-level AI autonomy matrix: automatic read/draft, one-click confirmed write, manual-only external/high-risk actions.
- Page-level route and redirect map for old entries, with no data deletion.
- States checklist: empty, loading, error, success, focus, disabled.
- Migration path for existing users and analytics needed for a 4–8 week validation.
- Cutover criteria for retiring duplicate resume, AI, planning and interview entries.
- Exact documentation and verification references for every implementation phase.

Anti-patterns to guard against:
- Porting the old tool directory under new styling.
- Keeping both designs behind a flag indefinitely.
- Exposing internal Agent selection in the new core flow.
- Letting AI auto-submit applications, send external messages, pay, refund, delete, or make irreversible changes.
- Treating every AI suggestion as a new page or product.
```
