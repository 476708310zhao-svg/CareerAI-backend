# 职引 Career Platform V4.0 更新说明与功能清单

> 更新时间：2026-07-16
>
> 项目目录：`C:\Users\admin\Desktop\求职小程序\jobapp-server`
>
> 开发分支：`codex/v4-development`
> V4 主体提交：`d541cb6 Implement V4 career platform workflows`

## 1. 文档用途

本文档用于统一说明职引 V4.0：

- 已经实现并提交的功能；
- 已实现但仍待最终验收的功能；
- 当前仅完成流程骨架、仍需接入真实 AI 的功能；
- Sprint 3 首页工作台的独立开发状态；
- 上线前必须完成的事项；
- 数据库、API、功能开关、迁移和灰度发布方式。

状态说明：

- ✅ 已完成并进入 V4 提交
- 🟡 已实现，但仍需验收、联调或提交
- 🟠 已完成流程骨架，生产能力仍需补齐
- ⬜ 尚未完成
- ⛔ 按产品策略暂不上线

## 2. V4.0 产品目标

职引 V4.0 定位为面向北美 STEM 学生的 AI 求职申请工作台，目标链路为：

```text
完善求职画像
→ 发现并判断目标岗位
→ 生成和优化申请材料
→ 管理申请进度
→ 准备岗位面试
→ 复盘能力短板
→ 提升获得 Offer 的机会
```

## 3. 当前版本总览

| 项目 | 当前状态 | 说明 |
|---|---|---|
| Sprint 1 岗位到申请闭环 | ✅ | 画像、Sponsor、三层匹配、岗位详情、申请 CRM 已完成 |
| Sprint 2 申请材料中心 | ✅ | 经历库、多版本简历、AI 修改确认、申请材料草稿和额度已完成 |
| Sprint 3 Today 驾驶舱 | 🟡 | 首页重构代码已在工作区完成，但尚未纳入 V4 Git 提交；Today 数据仍需统一 |
| Sprint 4 面试闭环 | ✅ | 面试空间、训练会话、评分、报告、趋势和补强任务已完成 |
| AI Career 四 Agent | 🟠 | 任务状态机、上下文、脱敏、确认写入已完成；当前输出仍为受控规则模板，未接真实模型调用 |
| 全链路埋点与看板 | ✅ | 标准事件、漏斗、7 日指标、AI 使用率、慢请求和错误看板已接入 |
| 会员与配额 | ✅ | 方案、权益、额度、订阅、到期降级、订单退款状态已完成 |
| 真实微信支付 | ⛔ | 双开关默认关闭，等待主体和支付资质确认 |
| 数据迁移与回滚 | ✅ | 正向迁移已执行，`pending=0`；回滚脚本默认 dry-run |
| 自动化测试 | 🟡 | 69/69 测试通过；真实 E2E 已通过 10/11，需开发者工具重新登录后最终复验 |
| 灰度发布 | 🟡 | 灰度脚本完成，目前保持 0% / paused，尚未正式放量 |

## 4. Sprint 1：岗位到申请闭环

### 4.1 用户求职画像

- ✅ 学校、专业、学位、毕业年份
- ✅ 国家、城市、目标岗位、目标行业
- ✅ 实习/全职目标
- ✅ F1、CPT、OPT、STEM OPT、工作授权与 Sponsor 需求
- ✅ 技能与项目数据
- ✅ 画像完成度和缺失字段提示
- ✅ 从 V3 教育和求职偏好初始化 V4 画像
- ✅ 用户主动填写和后续动态更新
- ⬜ AI 辅助填写画像尚未接入真实模型

主要接口：

- `GET /api/v4/profile`
- `PUT /api/v4/profile`
- `GET /api/v4/profile/completion`

### 4.2 Sponsor 岗位体系

- ✅ OPT Friendly
- ✅ STEM Friendly
- ✅ H1B Sponsor
- ✅ International Student Friendly
- ✅ Citizen Required
- ✅ Sponsor 来源、证据、可信度和人工审核状态
- ✅ 后台 Sponsor 审核页面
- ✅ Sponsor 修改历史和操作审计
- ✅ 岗位列表 Sponsor 筛选

### 4.3 岗位智能匹配

- ✅ 第一层：毕业时间、专业、学位、地区、工作授权、Sponsor 资格判断
- ✅ 第二层：技能、项目、经历、JD 关键词能力匹配
- ✅ 第三层：推荐等级、优势、短板和下一步行动
- ✅ 输出 `eligible / partial / ineligible`
- ✅ 输出 0–100 综合分及分维度评分
- ✅ 匹配结果缓存、批量重算和用户汇总
- ✅ Citizen Required 等硬性限制会压低或封顶匹配结果
- 🟠 当前匹配以确定性规则为主，真实 AI 语义分析仍需接入

### 4.4 岗位详情页

- ✅ 公司、岗位、地点、薪资、类型、发布时间、截止时间
- ✅ 官方申请链接
- ✅ 综合匹配、技能匹配、项目匹配、优势、短板和建议
- ✅ 公司信息、Sponsor 信息和当前申请记录
- ✅ AI 分析、加入申请、官方投递入口
- ✅ 官方投递事件记录

### 4.5 申请 CRM

支持状态：

```text
interested → preparing → applied
→ oa / phone_screen / interview_1
→ interview_2 → final → offer
```

关闭分支：`rejected`、`withdrawn`。

- ✅ 非法跨级状态变更返回 HTTP 409
- ✅ 状态更新和历史记录在同一事务中写入
- ✅ 准备申请、已申请、面试中、Offer、已关闭看板
- ✅ 申请详情聚合岗位、简历、材料、联系人、任务、历史和匹配结果
- ✅ 联系人管理
- ✅ 下一步任务管理
- ✅ 截止时间、面试时间、笔记、下一步行动
- ✅ 申请与简历版本、Cover Letter 关联

## 5. Sprint 2：申请材料中心

### 5.1 基础经历库

- ✅ Education
- ✅ Experience
- ✅ Projects
- ✅ Skills
- ✅ Awards
- ✅ 经历创建、更新、验证标记和归档

### 5.2 AI 简历中心

- ✅ SDE Resume
- ✅ AI Engineer Resume
- ✅ Data Resume
- ✅ Quant Resume
- ✅ General Resume
- ✅ 简历创建、复制、重命名和归档
- ✅ 默认简历版本
- ✅ 简历与目标岗位关联
- ✅ 简历与申请记录关联
- ✅ 不可变版本记录
- ✅ 版本对比
- ✅ 从旧版本恢复并生成新版本
- ✅ 免费版简历版本数量限制

### 5.3 AI 简历修改确认流程

已实现强制流程：

```text
原内容
→ AI 建议
→ 修改原因
→ 用户逐条接受、拒绝或手动编辑
→ 用户确认
→ 保存新版本
```

- ✅ AI 建议不会直接修改原简历
- ✅ 用户确认前不创建新版本
- ✅ 保存 AI 模型、提示词版本和提示词快照
- ✅ 新增量化信息必须存在于原简历或已验证经历
- ✅ 无法验证的数据返回 `UNVERIFIED_FACT`
- ✅ 记录优化次数和额度消耗
- 🟠 当前后端主要负责建议校验、确认和版本保存；真实模型生成建议仍需与现有 AI 客户端正式联调

### 5.4 AI 申请助手

- ✅ 按 JD 定制简历草稿
- ✅ Cover Letter 草稿
- ✅ Recruiter 消息草稿
- ✅ Follow-up 邮件草稿
- ✅ 草稿强制关联申请记录
- ✅ 可关联简历及具体版本
- ✅ 用户确认后才保存为正式申请材料
- ✅ 用户可在确认前手动编辑
- ✅ 用户拒绝后不保存材料
- ✅ 免费次数和会员额度控制
- 🟠 当前生成内容为受控模板逻辑，生产环境真实 AI 生成仍需接入和质量验收

## 6. Sprint 3：Today 驾驶舱与留存

### 6.1 首页工作台

- ✅ 首页已重构为求职工作台
- ✅ 已拆分 Today 计划、核心工具、推荐岗位、校招更新和求职情报组件
- ✅ 已通过 79/79 测试和小程序检查；此前首页微信 preview 已通过
- ✅ 首页文件和 V4 五项 TabBar 已完成独立审查

当前首页规划结构：

```text
职位搜索
→ 今日求职计划
→ 四个核心求职工具
→ Banner
→ 为你推荐
→ 今日校招
→ 求职情报
```

### 6.2 Today 任务

- ✅ 本地日常任务与申请进度任务已存在
- ✅ 面试报告短板可自动生成服务端 Today 补强任务
- ✅ AI Agent 经用户确认后可写入 Today 任务
- ✅ Today 任务完成事件已埋点
- ✅ 首页本地任务已与 V4 服务端 `today_tasks_v4` 幂等合并
- ✅ 已统一 high / medium / low 优先级、当天过期清理和跨设备完成状态
- ✅ 未登录和弱网保持本地任务；离线完成状态联网后自动补传

### 6.3 提醒与一级导航

- ✅ 已有岗位和校招截止提醒基础能力
- 🟡 V4 个性化提醒策略仍需与 Today 任务统一
- ✅ 一级导航已替换为 `Today / Jobs / Progress / AI Career / Profile`
- ✅ `Jobs`（岗位）一级 Tab 当前直接承载校招日历；原岗位推荐页保留为二级搜索与推荐入口
- ✅ Progress（求职进度）主包入口读取 V4 CRM，已提供本周重点、申请漏斗、准备度、优先级排序和手动新增申请
- ✅ 求职进度卡片可继续进入申请详情，管理材料、联系人、任务、历史和面试空间
- ✅ 已兼容线上旧响应、登录失效和云端暂不可用场景；可回退本机申请记录，离线新增不会丢失
- ✅ AI Career 主包入口整合四个 Agent、当前申请和任务历史
- ✅ AI Career 已完成紧凑工作台 UI：四 Agent 2×2 展示、分 Agent 快捷问题、申请上下文、安全写入确认和任务结果弹层
- ⬜ 收藏岗位更新提醒需要完整回归

## 7. Sprint 4：面试闭环

### 7.1 岗位专属面试空间

- ✅ 申请进入 `phone_screen / interview_1 / interview_2 / final` 后自动创建
- ✅ 公司、岗位、面试时间、轮次和准备完成度
- ✅ 公司历史面经
- ✅ 高频问题
- ✅ 算法题
- ✅ 行为题
- ✅ 岗位专项题
- ✅ 模拟面试和 STAR 训练入口

### 7.2 AI 面试与能力报告

- ✅ 模拟面试会话
- ✅ STAR 案例训练
- ✅ 内容、结构、表达、岗位匹配四维评分
- ✅ 单题反馈
- ✅ 总体面试报告
- ✅ 历史训练记录
- ✅ 能力趋势
- ✅ 短板自动转 Today 补强任务
- ✅ 面试训练次数配额
- 🟠 当前评分为确定性规则评分，真实模型面试追问和语义评分仍需生产接入

## 8. AI Career 统一入口

四个 Agent 已注册：

- ✅ `job_advisor`：AI 岗位顾问
- ✅ `application_assistant`：AI 申请助手
- ✅ `interview_coach`：AI 面试教练
- ✅ `career_planner`：AI 职业规划师

通用能力：

- ✅ 自动读取用户画像和当前申请上下文
- ✅ AI 任务历史记录
- ✅ `queued → running → completed / failed / awaiting_confirmation / cancelled`
- ✅ 超时、失败、重试和取消状态
- ✅ 手机号、邮箱、证件号和银行卡号脱敏
- ✅ 写操作必须使用用户确认令牌
- ✅ 确认后可更新申请下一步或创建 Today 任务
- 🟠 当前 Agent 输出由受控规则模板生成，尚未真正调用 DeepSeek/Ark 等模型

## 9. 全链路埋点与运营看板

- ✅ 画像开始和完成
- ✅ 岗位浏览、收藏和匹配
- ✅ 加入申请和官方投递
- ✅ 申请状态变更
- ✅ 简历优化和建议接受
- ✅ 申请材料生成和确认
- ✅ 面试训练开始和完成
- ✅ Today 任务完成
- ✅ AI Agent 使用
- ✅ 会员查看和购买开始
- ✅ 7 日活跃和留存数据
- ✅ 岗位到申请转化漏斗
- ✅ AI 功能使用率
- ✅ 会员订单统计
- ✅ 管理后台运营数据看板
- ✅ API 慢请求采样
- ✅ 服务端错误事件记录
- 🟡 外部错误告警通知渠道尚未正式配置

## 10. 会员商业化能力

- ✅ 会员方案和权益配置
- ✅ AI 调用额度
- ✅ 高级岗位匹配权益
- ✅ 简历版本数量限制
- ✅ 面试训练次数限制
- ✅ 配额查询和扣减
- ✅ 订阅状态
- ✅ 订单状态
- ✅ 退款状态数据结构
- ✅ 会员到期自动降级
- ✅ 免费版和 Pro 权益区分
- ⛔ 真实支付默认关闭

真实支付需要同时满足：

```env
PAYMENT_ENABLED=true
REAL_PAYMENT_LAUNCH_APPROVED=true
```

在资质确认前，`REAL_PAYMENT_LAUNCH_APPROVED` 必须保持 `false`。

## 11. 数据库更新

### 11.1 Sprint 1

- `user_profiles`
- `job_matches`
- `application_history`
- `job_sponsor_profiles`
- `job_sponsor_history`
- `application_contacts`
- `application_tasks`

### 11.2 Sprint 2

- `career_experience_library`
- `resume_versions_v4`
- `resume_job_links`
- `resume_ai_change_sets`
- `ai_application_material_drafts`

兼容扩展：

- `resumes`：`resume_type`、`current_version_id`、`archived_at`
- `application_materials`：申请、状态、AI 草稿、模型和提示词版本字段

### 11.3 Sprint 4

- `interview_spaces_v4`
- `interview_sessions_v4`
- `interview_answers_v4`
- `interview_reports_v4`
- `today_tasks_v4`
- `ai_agent_tasks_v4`
- `membership_plans_v4`
- `user_subscriptions_v4`
- `quota_usage_v4`
- `payment_refunds_v4`
- `rollout_config_v4`
- `error_events_v4`
- `api_performance_v4`

所有 V4 建表和扩展逻辑均为幂等设计，可重复执行。

## 12. API 模块清单

| 模块 | 路径前缀 |
|---|---|
| 用户画像 | `/api/v4/profile` |
| 岗位、Sponsor、匹配 | `/api/v4/jobs` |
| 申请 CRM | `/api/v4/applications` |
| 经历库和简历中心 | `/api/v4/resumes` |
| 申请材料 | `/api/v4/materials` |
| 面试空间和报告 | `/api/v4/interviews` |
| AI Career Agent | `/api/v4/agents` |
| 会员和配额 | `/api/v4/membership` |
| V4 管理后台 | `/admin/api/v4` |

详细接口请继续参考：

- `docs/V4_SPRINT1_BACKEND.md`
- `docs/V4_SPRINT2_APPLICATION_MATERIALS.md`
- `docs/V4_SPRINT4_API.md`

## 13. 数据迁移、回滚和灰度

### 13.1 迁移

```bash
# 只生成迁移计划
npm run migrate:v4

# 正式执行
npm run migrate:v4 -- --apply
```

当前本地正式迁移已经完成，二次 dry-run 显示用户、岗位和申请均为 `pending=0`。

### 13.2 回滚

```bash
# 默认只生成回滚计划
npm run rollback:v4

# 正式回滚必须二次确认
npm run rollback:v4 -- --apply --confirm=ROLLBACK_V4
```

回滚脚本只处理带迁移标记且未被用户编辑的数据。

### 13.3 灰度

```bash
npm run rollout:v4 -- 5 --apply
npm run rollout:v4 -- 20 --apply
npm run rollout:v4 -- 50 --apply
npm run rollout:v4 -- 100 --apply
```

仅允许 `0 / 5 / 20 / 50 / 100`。当前状态为：

```text
percentage = 0
status = paused
```

### 13.4 功能开关

- `V4_INTERVIEW_FEATURE_ENABLED`
- `V4_AI_CAREER_FEATURE_ENABLED`
- `V4_MEMBERSHIP_FEATURE_ENABLED`

默认全部关闭，灰度前按模块开启。

## 14. 当前验证结果

### 14.1 已通过

- ✅ `npm run check:release`
- ✅ 后端自动化测试 69/69
- ✅ 小程序静态和分包检查
- ✅ 数据内容检查：Errors 0
- ✅ V4 运维检查：Errors 0
- ✅ 灰度配置：0% / paused
- ✅ E2E 预检 4/4
- ✅ 高置信度密钥扫描未发现秘密

### 14.2 已知警告

- 支付路由包含开发模拟支付相关文案
- 个别旧页面仍有占位或测试提示文案
- 测试中的提醒派发接口约 1.5–2.6 秒，超过 800ms 慢请求阈值

### 14.3 真实 E2E

- 已通过 10/11 个真实页面场景
- 已修复岗位面试空间数字 ID mock 路由转义问题
- 最终完整回归因微信开发者工具提示 `access_token missing` 尚未完成
- 需要重新登录微信开发者工具后执行完整 11 场景回归

## 15. 上线前剩余工作

### P0：必须完成

- ✅ 审查并提交 Sprint 3 首页工作台改动
- ✅ 统一首页本地 Today 任务与服务端 `today_tasks_v4`
- 🟡 已为 Agent、申请材料、简历建议和面试评分接入统一 AI 运行时；待配置生产 Key 后完成真实供应商验收
- 🟡 已完成关闭、成功、超时重试和非法响应降级测试；待执行供应商 429、5xx 和网络中断演练
- ⬜ 微信开发者工具重新登录后完成 11/11 真实 E2E
- ⬜ 真机检查登录、岗位、申请、简历、面试和会员展示
- ⬜ 确认生产环境变量和密钥配置
- ⬜ 完成 5% 灰度前发布评审

### P1：建议灰度前完成

- ⬜ 优化提醒派发慢请求
- ⬜ 配置外部错误监控和告警通知
- ✅ 一级导航已切换为 `Today / Jobs / Progress / AI Career / Profile`
- ⬜ 验证收藏岗位更新提醒和跨设备任务同步
- ⬜ 对 7 日留存、岗位转化漏斗和 AI 使用率做真实数据校验
- ⬜ 补充管理员操作审计和数据导出策略

### P2：资质和运营确认后完成

- ⬜ 真实微信支付接入和回调验收
- ⬜ 退款实操流程
- ⬜ 5% → 20% → 50% → 100% 灰度放量
- ⬜ 灰度期间监控转化率、错误率、慢请求和 AI 成本

## 16. V4 明确暂缓范围

- ⛔ 泛社区
- ⛔ 社交关系
- ⛔ 大量资讯扩张
- ⛔ 无实际求职价值的通用 AI 聊天
- ⛔ Offer 概率预测
- ⛔ 复杂职业测评

## 17. 下一步建议顺序

1. 配置测试环境真实 AI Key，完成供应商调用和异常演练。
2. 重新登录微信开发者工具，完成 11/11 真实 E2E。
3. 完成真机验收和生产配置检查。
4. 保持真实支付关闭，先从 5% V4 功能灰度开始。
