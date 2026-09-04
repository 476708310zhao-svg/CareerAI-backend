# 数据库迁移基线与恢复手册

更新时间：2026-09-04
状态：Sprint 2.5 自动化基线已完成；生产 apply 待 Human 上线审批

## 1. 当前结论

项目继续使用 SQLite 和 `better-sqlite3`，不引入 ORM。Sprint 2.5 已建立：

- `schema_migrations` 版本表；
- `db/migrations/*.sql` 顺序迁移目录；
- 单迁移 `IMMEDIATE` 事务、SHA-256 校验和与重复执行保护；
- 当前结构 baseline 前置表/字段检查；
- 显式数据库目标、备份校验和生产审批保护；
- 隔离数据库的备份、迁移、失败回滚、恢复和重复执行演练。

本批不删除 `db/database.js`、`db/v4Schema.js` 和三个历史业务路由中的启动期 DDL。它们是尚未完成所有环境 baseline 登记前的兼容兜底；从本基线之后新增的表、字段和索引必须先增加 migration，不得再增加新的路由建表逻辑。

## 2. 目录与记录格式

```text
db/
├── backup.js
├── migrate.js
└── migrations/
    └── 0001_current_schema_baseline.sql
scripts/
├── migrate_database.js
└── rehearse_database_migrations.js
```

版本表：

```sql
CREATE TABLE schema_migrations (
  version      TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  checksum     TEXT NOT NULL,
  execution_ms INTEGER NOT NULL DEFAULT 0,
  applied_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`0001_current_schema_baseline.sql` 是标记型 baseline，不重复执行历史 DDL。登记前会检查核心旧表、V4 表、Analytics 分类字段以及 `orders`、aggregate、OA 表是否存在，防止把缺结构的数据库误标为完成。

## 3. 执行规则

1. 文件名必须为 `<至少四位数字>_<小写名称>.sql`，按文件名排序。
2. 同一版本只能出现一次。
3. SQL 文件禁止自行写 `BEGIN`、`COMMIT` 或 `ROLLBACK`；执行器统一管理事务。
4. 一个迁移的 SQL 和版本记录位于同一个 `IMMEDIATE` 事务。
5. 已应用版本不会重复执行；已应用文件的 SHA-256 变化会阻断执行。
6. 已登记但仓库缺少对应 SQL 文件时会阻断执行。
7. baseline 的 `-- @require-table table:column1,column2` 声明必须全部满足后才可登记。
8. 数据回填必须幂等，并与无关业务修改分开提交。

## 4. 安全命令

只读查询版本，不创建表、不写数据库：

```powershell
npm run migrate:db -- --db="D:\path\to\jobapp.db" --status
```

应用迁移必须显式给出目标、已存在且通过 `integrity_check` 的备份和确认口令：

```powershell
npm run migrate:db -- --db="D:\path\to\jobapp.db" --backup="D:\path\to\jobapp.pre-migration.db" --apply --confirm=APPLY_SCHEMA_MIGRATIONS
```

生产环境还要求 `--production-approved`，但该参数不能替代 Human 审批。正确顺序是：停止写流量、生成一致性备份、验证备份、获得审批、执行 migration、运行健康检查，再恢复流量。

隔离演练：

```powershell
npm run rehearse:db-migrations
```

可用 `--source=<数据库路径>` 指定只读源。演练会先用 SQLite backup API 生成一致性工作副本，此后所有 DROP、迁移、故障注入和恢复都只发生在系统临时目录；默认结束后删除临时目录。

## 5. Sprint 2.5 演练结果

2026-09-04 使用当前本地数据库的一致性快照完成隔离演练，未写生产数据库，也未修改源数据库：

| 检查 | 结果 |
|---|---|
| 一致性备份创建 | 通过，11,182,080 bytes |
| baseline 应用 | 通过，`0001` 已登记，pending=0 |
| 迁移后 `integrity_check` | `ok` |
| 原有数据探针 | 保留 |
| 第二次重复执行 | appliedNow=0 |
| 强制失败迁移 | SQL 与版本记录均完整回滚 |
| 从迁移前备份恢复 | SHA-256 完全一致 |
| 恢复后版本状态 | baseline 记录已撤销，符合回滚预期 |
| 恢复后 `integrity_check` | `ok` |
| 生产写入 | 0 |

备份快照 SHA-256：`bbaf7ec4d17c0753ba84b30b411046a22ac9f9e03eadf4b9ce00159015347ad3`。该值只对应本次临时演练副本，不是生产备份凭据。

## 6. 回滚原则

- 向前兼容的加表、加列优先使用新的修复 migration，不回改已应用 SQL。
- 删除表、删除列、大规模数据回填必须在发布前单独设计回滚和数据保留期。
- 当前 baseline 是历史结构标记，不提供“反向删除全部表”的 down migration。
- baseline 或不可逆结构发布失败时，标准回滚是停止服务后恢复发布前一致性备份，再核对 `integrity_check`、版本记录和关键数据计数。
- V4 的业务数据回填仍使用 `migrate:v4` / `rollback:v4`，它与 schema migration 职责不同。

## 7. 后续收口

1. Human 在 staging 和生产的已验证备份副本上先查询状态并登记 baseline。
2. 确认所有长期环境均为 `pending=0` 后，再分批把 `orders`、`aggregated_jobs` / `cron_logs`、`oa_questions` 和 V4 启动 DDL 迁出路由/启动代码。
3. 最终让 `db/database.js` 只负责连接、PRAGMA、迁移状态检查和最小兼容保护。
4. 任何生产 apply、恢复或回滚仍属于人工上线门禁，不由日常开发自动执行。
