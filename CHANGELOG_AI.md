# AI 修改记录

本文件记录 AI 参与的主要代码改动、验证结果和后续注意事项，便于多 AI 协作时快速接手。

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
