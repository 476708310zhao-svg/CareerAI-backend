# Dieter Rams scorecard

总分：**11/30**

1. **Good design is innovative — Score: 2/3**
   Evidence: 产品已经把 Today、申请上下文、AI 建议和确认写入串在一起，但仍把四 Agent 和工具目录暴露给用户，见 `01-evidence.md#4-ai-operation-boundary`。
   Justification: 它刷新了聊天式 AI 的用法，却还没有把编排能力变成真正无感的产品形态，因此不是 3 分。

2. **Good design makes a product useful — Score: 2/3**
   Evidence: 首页和进度页已经直接展示下一步，但用户仍可能在 29 个资源入口、四专家和通用助手之间绕行，见 `01-evidence.md#1-structural-evidence`。
   Justification: 主任务可以完成，但相邻工具面增加了额外决策和步骤，符合 2 分而不是最短路径的 3 分。

3. **Good design is aesthetic — Score: 1/3**
   Evidence: 核心样式出现 45 个 spacing 值、30 个字号和 355 个唯一 hex literal，见 `01-evidence.md#2-visual-evidence`。
   Justification: 虽然有全局 token，但页面仍形成远超过少量例外的视觉分叉，无法达到统一系统的 2 分。

4. **Good design makes a product understandable — Score: 1/3**
   Evidence: 用户需理解 Agent、JD、ATS、OA、STAR、Copilot、Sponsor、Today 等术语，并在 AI 页手动选择角色与上下文，见 `01-evidence.md#31-terminology-load`。
   Justification: 主操作仍可辨认，但远不止一个控件需要解释，因此只能给 1 分。

5. **Good design is unobtrusive — Score: 1/3**
   Evidence: 全局悬浮 AI 有 7 个无限动画，首页还有 autoplay Banner、会员推广和未读 badge，见 `01-evidence.md#5-weight-and-friction`。
   Justification: 装饰和推广明显与任务内容竞争注意力，符合 1 分。

6. **Good design is honest — Score: 1/3**
   Evidence: 匹配分被映射到 75–98%，最近对话为硬编码样例，固定动画被描述为思考阶段，见 `01-evidence.md#32-inflated-or-unsupported-claims` 和 `#33-label-to-behavior-mismatches`。
   Justification: 存在多项膨胀和至少一项误导性模式，但没有发现隐藏费用、强制续费或虚假稀缺，因此不是 0 分。

7. **Good design is long-lasting — Score: 1/3**
   Evidence: `AI CAREER OS`、四 Agent、Copilot、CareerGPT 等趋势化标签并存，文档和运行源已经发生功能漂移，见 `01-evidence.md#31-terminology-load` 和 `#33-label-to-behavior-mismatches`。
   Justification: 多个强年份感的 AI 标签会很快过时，因此只能给 1 分。

8. **Good design is thorough down to the last detail — Score: 1/3**
   Evidence: empty/loading/error/success 基本齐全，但 focus 缺失、disabled 不一致、ARIA 覆盖不一致，见 `01-evidence.md#21-ui-state-coverage` 和 `#6-accessibility-evidence`。
   Justification: 至少两类状态或细节存在系统性缺口，按规则给 1 分。

9. **Good design is environmentally friendly — Score: 1/3**
   Evidence: 实际包体和 TTI 未知，但默认至少有 8 个持续动画、最多 27 个骨架动画，且没有 reduced-motion，见 `01-evidence.md#5-weight-and-friction`。
   Justification: 动效没有被用户偏好或任务状态约束，无法达到 motion gated 的 2 分。

10. **Good design is as little design as possible — Score: 0/3**
    Evidence: 资源页有 29 个入口，静态配置至少有 14 个重复目的簇和 25 个额外入口声明，AI 还有四专家、8 个工具和 5 个欢迎入口，见 `01-evidence.md#13-depth-and-repeated-affordances`。
    Justification: 页面已经由重复入口和产品内部分类主导，符合“duplicated affordances dominate”的 0 分锚点。
