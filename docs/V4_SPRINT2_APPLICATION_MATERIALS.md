# V4 Sprint 2：申请材料中心

## 本批已实现

### AI 简历中心

- Education、Experience、Project、Skill、Award 五类基础经历库，支持核验标记与归档。
- SDE、AI Engineer、Data、Quant、General 五种简历类型。
- 简历创建、复制、重命名、归档、默认版本。
- 简历与目标岗位、申请记录关联。
- 不可变版本记录、版本差异对比、恢复为新版本。

### AI 简历修改确认流程

状态流转为：`原版本 -> pending AI 建议 -> 用户逐条接受/拒绝或手动编辑 -> confirmed 新版本`。

- 生成建议时不更新 `resumes.data`，也不创建简历版本。
- 用户确认后创建新的 `resume_versions_v4` 记录，原版本保持不变。
- 每条建议保存原内容、建议内容、原因和用户决定。
- 保存 AI 模型、提示词版本、提示词快照、额度类型与消耗。
- 新增量化数据必须存在于原简历或已核验经历，否则返回 `UNVERIFIED_FACT`。
- 免费用户每天 3 次 AI 简历优化；有效会员不限次。

### AI 申请助手

- 按 JD 定制简历、Cover Letter、Recruiter 消息、Follow-up 邮件。
- 草稿强制关联申请记录，并可关联简历及具体版本。
- 生成后仅进入 `pending` 草稿表；用户确认后才写入申请材料库。
- 定制简历确认后创建新简历版本，并把该版本关联回申请记录。
- 支持用户在确认前手动编辑，拒绝草稿不会保存材料。
- 免费用户每天 3 次 AI 申请助手；有效会员不限次。

## 新增数据表

- `career_experience_library`
- `resume_versions_v4`
- `resume_job_links`
- `resume_ai_change_sets`
- `ai_application_material_drafts`

兼容扩展：

- `resumes` 新增 `resume_type`、`current_version_id`、`archived_at`。
- `application_materials` 新增 `application_id`、`status`、`ai_draft_id`、`ai_model`、`prompt_version`。

迁移由 `ensureV4Schema()` 幂等执行，可重复运行；已有简历首次访问时会生成 V1 迁移版本。

## 新增 API

### 经历库与简历

- `GET/POST /api/v4/resumes/experiences`
- `PATCH /api/v4/resumes/experiences/:id`
- `POST /api/v4/resumes/experiences/:id/archive`
- `GET/POST /api/v4/resumes`
- `PATCH /api/v4/resumes/:id`
- `POST /api/v4/resumes/:id/copy|archive|default|links`
- `GET /api/v4/resumes/:id/versions`
- `GET /api/v4/resumes/:id/versions/compare`
- `POST /api/v4/resumes/:id/versions/:versionId/restore`

### AI 确认与申请材料

- `POST /api/v4/resumes/:id/ai-change-sets`
- `POST /api/v4/resumes/ai-change-sets/:id/confirm|reject`
- `GET /api/v4/materials/quota`
- `GET/POST /api/v4/materials/drafts`
- `POST /api/v4/materials/drafts/:id/confirm|reject`

## 验证

- `ensureV4Schema()` 连续执行两次通过。
- `npm test`：65/65 通过。
- `npm run check:miniprogram`：通过。
- 自动化覆盖：AI 草稿不覆盖原简历、逐条确认、版本对比与恢复、防虚构、材料确认后保存、申请关联和免费额度拦截。
