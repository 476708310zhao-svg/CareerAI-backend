# 简历 API 去重方案

更新时间：2026-05-09

## 结论

保留 `/api/resumes` 作为唯一主入口。`/api/users/resumes` 继续作为旧版兼容入口，短期不删除、不改变响应结构，避免影响已上线小程序页面。

旧接口下线窗口：从 2026-05-09 起保留 6 个月，计划在 2026-11-09 后评估下线。

## 当前问题

- `/api/resumes` 已覆盖多份简历 CRUD，支持 `data` 字段存储完整前端简历 JSON。
- `/api/users/resumes` 仍在 `routes/users.js` 中提供列表、详情、新建、更新等兼容接口。
- 两套接口返回字段不同：`/api/users/resumes` 会拆 `education`、`experience`、`skills`，`/api/resumes` 以 `data` 为主。
- 前端维护者容易误用旧入口，导致后续能力分叉。

## 主入口约定

| 能力 | 主接口 |
|---|---|
| 简历列表 | `GET /api/resumes` |
| 简历详情 | `GET /api/resumes/:id` |
| 新建简历 | `POST /api/resumes` |
| 更新简历 | `PUT /api/resumes/:id` |
| 删除简历 | `DELETE /api/resumes/:id` |

## 兼容入口约定

`/api/users/resumes` 仅用于兼容旧页面或旧版本客户端。后续不再新增字段和新能力。

当前已实施：

1. `routes/users.js` 旧接口添加 `Deprecation`、`Sunset`、`Link` 响应头。
2. 小程序 `utils/api-resumes.js` 只调用 `/api/resumes` 主入口。
3. 已搜索小程序页面，未发现 `/api/users/resumes` 调用。
4. 删除旧接口前必须在 2026-11-09 后单独评估线上版本兼容性。

## 不在本批处理

- 不删除 `/api/users/resumes`，6 个月兼容窗口内只标记 deprecated。
- 不迁移历史数据结构。
- 不调整免费/VIP 简历份数限制。
- 不改变当前小程序页面展示字段。

## 验收标准

- 新代码不再新增 `/api/users/resumes` 调用。
- 简历相关文档明确 `/api/resumes` 是主入口。
- 删除旧接口前必须单独评估线上版本兼容性。
