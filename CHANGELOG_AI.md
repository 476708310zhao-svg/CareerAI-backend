# AI 修改记录

本文件记录 AI 参与的主要代码改动、验证结果和后续注意事项，便于多 AI 协作时快速接手。

## 2026-09-08

### Sprint 4 竞争力诊断与 AI 陪跑

- 内容：
  - 新增教育、经历、技能、项目、简历、面试和 Networking 七维证据评分，每维提供证据、差距和 Today 行动入口。
  - 基于真实申请状态与历史识别漏斗瓶颈，生成动态 3/6/12 月计划和不制造伪成功率的周报告。
  - 每日幂等生成 3～5 个服务端 Today 任务，支持完成、延期 1～30 天、跨设备同步和站内提醒时间。
  - 新增诊断/周报纯增量 migration、Career API、资源中心入口和小程序“竞争力陪跑”页面。
- 验证：Sprint 4 专项 5/5、migration 5/5、全量 176/176、`npm run check:release` 通过；AI 质量矩阵 7/7，外部请求 0；未运行真实 E2E。
- 注意：竞争力分数衡量系统内可核验证据，不是个人能力或录用概率；生产 migration、真实用户灰度和系统级推送仍需 Human 审批。

## 2026-09-04

### Sprint 3 三项高价值 AI 闭环

- 内容：
  - Job Match 增加 Safe/Target/Reach/Blocked 梯次、是否值得投的明确决策及可追溯 Sponsor/身份判断。
  - 岗位详情把 JD、岗位与申请上下文带入简历中心；用户选择真实简历当前版本并逐条确认后，系统创建不可变新版本并绑定回申请。
  - 面试空间增加公司×岗位×轮次 Brief；报告把弱项转成带专项深链的 Today 复练任务，并避免覆盖用户已有其他下一步。
- 验证：Sprint 3 专项 5/5、全量 170/170、`npm run check:release` 通过；AI 质量矩阵 7/7，外部请求 0；未运行真实 E2E。
- 注意：分层是申请资源配置建议，不是录用概率；Sponsor 未知必须核实，公民身份等硬冲突不能包装成 Reach。

### Sprint 2.5 数据库 migration baseline

- 内容：
  - 新增带事务、版本、SHA-256 和 baseline 前置结构检查的通用 migration runner。
  - 新增显式目标/备份/确认保护、只读状态命令和 SQLite 一致性 backup/restore 工具。
  - 新增隔离数据库的一键备份、迁移、幂等、故障回滚、恢复演练。
- 验证：migration 专项 5/5、全量测试 165/165；隔离演练 8 项检查通过，生产写入 0；未运行真实 E2E。
- 注意：生产 baseline 登记必须在 Human 审批和已验证备份之后执行；现有启动期 DDL 暂时保留为兼容兜底。

## 2026-05-09

### 第一批安全修复记录入库

- 提交：`2adbb1a Add security smoke tests and AI roadmap`
- 内容：
  - 新增 `AI功能清单开发.md`
  - 新增基础 `tests/smoke.test.js`
- 验证：`npm test` 通过，4/4。

### 第二批 P1 文档与测试

- 提交：`01f0608 Expand smoke tests and collaboration docs`
- 内容：
  - 新增 `AGENTS.md`
  - 新增 `DEVELOPMENT_STATUS.md`
  - 补充 `README.md`
  - 扩展后端 smoke tests
- 验证：`npm test` 通过，11/11。

### P1 决策实施

- 提交：`bcdc35b Fix Adzuna content-type as header not query param`
- 内容：
  - `data/jobs.json` 固定为唯一本地职位数据源
  - AI 助手/规划/工作流增加免费次数和 VIP 权限边界
  - `/api/users/resumes` 标记 deprecated
  - 新增支付 Mock 阶段说明
- 验证：`npm test` 通过，13/13。

### P1 AI 响应治理

- 提交：`240535b Complete P1 AI response governance`
- 内容：
  - AI 参数错误和上游错误统一为 `{ code, message, data }`
  - `career-plan`、`project-builder`、`workflow` 增加最小 JSON schema 校验
- 验证：`npm test` 通过，15/15。

### P2 上传安全与 CI

- 提交：`6e668c0 Extract shared upload security checks`
- 内容：
  - 新增 `utils/uploadSecurity.js`
  - 头像上传和后台 Banner 上传复用 MIME/magic bytes 校验
  - 新增 `.github/workflows/test.yml`
- 验证：`npm test` 通过，16/16。

## 协作注意事项

- 后端项目目录：`C:\Users\admin\Desktop\求职小程序\jobapp-server`
- 小程序项目目录：`C:\Users\admin\Desktop\求职小程序\求职小程序`
- 已有 deploy workflow 属于用户既有工作流，除非明确要求，不要修改。
- 真实微信支付上线前只保持 Mock 模式验证流程。
- `/api/users/resumes` 保留 6 个月兼容窗口，2026-11-09 后再评估下线。

## 2026-06-22

### 职位功能全局开关

- 新增 `RECRUITMENT_FEATURE_ENABLED` 服务端环境变量和 `/api/features` 公开状态接口。
- 关闭时统一拦截职位、职位聚合和一键申请接口，保留 Banner、校招、公司资料及个人网申记录接口。
- 小程序启动时同步并缓存开关状态，动态隐藏职位 Tab、首页岗位区域和职位收藏。
- 招聘相关页面增加直接访问守卫，旧分享链接或缓存路径会返回首页。
- 验证：后端 smoke tests 40/40 通过；小程序 JS 语法检查和包体检查通过。
