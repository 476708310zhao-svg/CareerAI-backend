# 数据库迁移治理方案

> V4 Sprint 4 已增加安全回滚：`npm run rollback:v4` 默认只执行 dry-run；正式回滚必须使用 `npm run rollback:v4 -- --apply --confirm=ROLLBACK_V4`。脚本只删除带迁移标记且未被用户编辑的数据。

更新时间：2026-05-09

## 当前状态

项目当前使用 SQLite 和 `better-sqlite3`。表结构主要在 `db/database.js` 启动时创建，部分字段通过 `PRAGMA table_info` 检查后用 `ALTER TABLE` 补齐。

这种方式适合早期快速迭代，但随着表数量增加，会出现几个问题：

- DDL、索引、兼容补字段混在同一个文件中。
- 不容易确认某个环境已经执行到哪个结构版本。
- 字段删除、数据回填、复杂迁移难以审计。
- 多 AI 并行开发时容易重复添加字段或索引。

## 目标

- 为数据库结构引入明确版本号。
- 每次结构变化有独立迁移文件和执行记录。
- 保持 SQLite 简单部署，不引入重型 ORM。
- 迁移失败时能明确定位并停止启动。

## 建议设计

新增表：

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT (datetime('now'))
);
```

新增目录：

```text
db/
├── migrations/
│   ├── 202605090001_create_ai_usage.sql
│   └── 202605090002_add_resume_data.sql
└── migrate.js
```

执行规则：

- `db/migrate.js` 启动时读取 `db/migrations/*.sql`。
- 按文件名前缀排序执行。
- 已在 `schema_migrations` 记录的版本不重复执行。
- 每个迁移在事务中执行。
- 执行成功后写入版本记录。

## 分阶段落地

### 阶段 1：只建立机制

- 新增 `schema_migrations`。
- 新增迁移执行器。
- 不搬迁已有表结构。
- 将后续新增表和字段都通过 migrations 管理。

### 阶段 2：回填当前结构版本

- 为当前线上结构生成 baseline 版本。
- 标记当前环境已应用 baseline。
- 保持 `db/database.js` 的 `CREATE TABLE IF NOT EXISTS` 作为短期兜底。

### 阶段 3：减少启动期 DDL

- 新结构只通过迁移文件进入。
- `db/database.js` 保留连接、PRAGMA、基础检查。
- 删除已经过迁移固化的补字段逻辑。

## 禁止事项

- 不在业务路由里创建业务表，支付订单表后续也应迁入 `db/database.js` 或 migrations。
- 不在没有备份的情况下删除字段或表。
- 不把数据回填和无关业务代码混在同一个提交。

## 下一步建议

P2 阶段先只保留本方案，不立即重构数据库启动流程。等 P2 文档和测试稳定后，再单独建迁移机制任务。
