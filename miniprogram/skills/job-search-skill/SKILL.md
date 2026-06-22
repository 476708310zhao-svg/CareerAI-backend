# 职引岗位搜索 Skill

## 业务流程

用户提出找工作、找实习或筛选签证友好岗位
→ 调用 `searchJobs`
→ 展示岗位列表卡片
→ 用户点击某个岗位
→ 调用 `getJobDetail`
→ 展示岗位详情卡片
→ 用户进入职引现有岗位详情页。

## 强制约束

1. `jobId` 必须来自 `searchJobs` 返回结果。
2. 禁止根据自然语言编造 `jobId`。
3. 禁止编造岗位、公司、薪资、签证支持情况和更新时间。
4. 用户未提供全部筛选条件时，只使用用户明确表达的条件。
5. 用户说“留学生可投”或“签证友好”时，优先使用现有 `OPT`、`CPT`、`H-1B`、`E-Verify` 标签筛选。
6. 没有匹配结果时，应建议调整关键词、地区、城市、岗位类型或更新时间。
7. `searchJobs` 成功后必须展示岗位列表卡片。
8. `getJobDetail` 必须使用上游真实 `jobId`。
9. 第一阶段不允许自动投递。
10. 第一阶段不读取或修改用户完整简历。
11. 第一阶段不做批量收藏。
12. 第一阶段只实现查询、展示和跳转。

## 已复用接口

- 岗位列表：`GET /api/jobs/aggregate`
- 岗位详情：优先 `GET /api/jobs/detail?job_id=...`，必要时兜底 `GET /api/jobs/:id`

## 页面

- 岗位列表页：`/pages/jobs/jobs`
- 岗位详情页：`/package-user/pages/job-detail/job-detail?id={jobId}`
