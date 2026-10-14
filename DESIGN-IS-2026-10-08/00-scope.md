# Design audit scope

## Audited product

职引微信小程序当前核心产品架构，重点检查“功能是否过多、用户是否必须理解大量工具、哪些操作应由 AI 代办”。

审计表面包括：

- 五个一级 Tab：首页、找岗位、进度、资源中心、我的。
- 首页的 Today/岗位/校招/AI 面试入口。
- 资源中心的四阶段工具目录和 AI 专家入口。
- 求职进度的申请状态推进。
- AI 专家、申请材料、面试训练等跨页面工作流。
- 我的页面中的个人资产和设置入口。

主要源文件：

- `miniprogram/app.json`
- `miniprogram/pages/index/*`
- `miniprogram/pages/jobs/*`
- `miniprogram/pages/applications/*`
- `miniprogram/pages/resources/*`
- `miniprogram/pages/profile/*`
- `miniprogram/pages/ai-career/*`
- `miniprogram/package-ai/pages/ai-assistant/*`
- `docs/PRODUCT_COMPLEXITY_RESEARCH_20260914.md`
- `docs/PRODUCT_OPTIMIZATION_CHECKLIST_20260914.md`
- `docs/V5_P0_MOBILE_WORKFLOW_20260915.md`

## Primary user

正在准备校招、同时管理多个岗位申请的留学生和应届生；他们通常时间紧、信息分散，不熟悉产品内部“JD 匹配、材料中心、面试空间、STAR、OA Copilot”等工具边界。

## Primary task

用户围绕一个目标岗位，快速知道并完成当前最重要的下一步，例如完善材料、投递、准备 OA、练习面试或跟进结果。

## Constraints

- 保留微信原生小程序和现有 Node.js/Express/SQLite 技术栈。
- 不删除用户已有简历、申请、面试、错题、计划和订单数据。
- 支付、登录、上传、数据库迁移仍是高风险链路，需独立验证。
- 资源和能力可以保留，但不应要求用户理解完整工具地图。
- AI 不得虚构动作；涉及写入、投递、付款、外发消息和删除时必须确认。
- 首轮目标是简化核心体验，不新增另一套数据模型或平行工作流。

## Reference direction

不以追逐“AI 原生”视觉趋势为目标。参考方向是：以申请对象为中心、一个主入口、系统主动生成下一步、AI 在后台编排已有工具、关键外部动作保持用户确认。

## Audit method limitation

本次以静态仓库和已有产品文档为主，不启动微信开发者工具或真机，因此运行时网络请求、首屏耗时、实际对比度和焦点顺序只能标记为推断或未知，不能伪装成实测值。
