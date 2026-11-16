# Phase 1A 私有 PDF 后端接口与运行边界

阶段 1A 只提供管理员内部导入底座，不提供原件下载、深度 PDF 校验、扫描通过、授权批准或发布接口。所有新资产默认 `validation_status=pending`、`scan_status=pending`、`processing_right=0`、`display_right=0`、`publish_status=blocked`。当前没有私有生产对象存储和病毒扫描适配，生产环境无论开关如何均拒绝上传与新建批次。

## 本地启用与备份

先在**隔离开发数据库**执行 `npm run migrate:db`，核对 `0016_private_pdf_assets` 已应用；设置 `NODE_ENV=development` 与 `QUESTION_PDF_LOCAL_IMPORT_ENABLED=1` 后方可使用导入接口。未设置该开关时默认关闭。`NODE_ENV=test` 仅供隔离测试。

原件默认位于 `DATA_DIR/private-question-pdfs`，临时上传位于其 `tmp` 子目录；这两个目录都不在 Express 公开的 `/uploads` 下，也不返回原件 URL。若设置 `QUESTION_PDF_PRIVATE_DIR`，只能选择 `DATA_DIR` 的子目录，且不能与公开静态目录双向交叠或经符号链接、junction 指向别处。备份必须同时包含数据库和 `DATA_DIR/private-question-pdfs`（或选定的私有子目录），并保持两者一致；仅备份 SQLite 无法恢复原件。默认私有目录已加入 `.gitignore`，自定义子目录需要自行确保不会被 Git 跟踪。

本地临时区上限为 256 个文件或 1 GiB，超过时关闭新上传。创建批次或登记来源时会分批清除超过 24 小时的临时文件和无数据库引用的原件，每次最多 100 个；事务失败时立即清除新存文件。清理不会删除数据库仍引用的文件。进程崩溃后可通过下一次批次或来源登记触发清理；长期停用时，应在隔离维护流程中核对数据库与私有目录，不能直接清空整个目录。

## 接口

全部位于 `/admin/api/v4/question-assets`，要求管理员 JWT 和独立 `questionAssets` 权限；成功响应沿用 `{code:0,message,data}`，响应带 `Cache-Control: no-store`。

1. `POST /batches`：JSON `{label,clientBatchKey}`，创建批次；同一管理员的相同键幂等，标题不一致返回 409。
2. `POST /batches/:batchId/sources`：JSON `{clientKey,sourceType,sourceReference,originalFilename}`，登记来源；同一批次的 `clientKey` 幂等，内容不同则返回 409。文件名必须是 `.pdf`。
3. `POST /batches/:batchId/sources/:sourceId/complete`：`multipart/form-data`，唯一字段 `file`，文件名须与登记值一致。单次 multipart 限制 25 MiB，服务端只做有界的 PDF 头尾预检和异步流式 SHA-256（60 秒截止），成功后转隔离状态；不在 HTTP 请求内解析 PDF。返回的 `validationStatus=pending` 表示结构、加密状态都未确认，`scanStatus=pending` 表示尚未病毒扫描；不做 OCR。
4. `POST /batches/:batchId/sources/:sourceId/retry`：同上；失败来源可重新上传，已隔离来源返回现有记录。
5. `GET /batches?cursor=&limit=`：分页列出批次，供响应丢失后恢复查询；`limit` 为 1–100，默认 50。
6. `GET /batches/:batchId?cursor=&limit=`：分页查看来源、尝试次数和失败代码，返回 `total`、`nextCursor`；不返回存储 key 或原件内容。

相同 SHA-256 对应同一资产，但每个来源保留独立记录及审计；复用已存原件前会重新核对普通文件类型、长度及全文件哈希。头尾预检失败的文件记录 `failed` 和错误码；结构损坏或疑似加密的文件即使通过预检，也只能保持隔离、待深度校验，不能发布。数据库约束要求 `validation_status=valid`、扫描通过及处理/展示授权都具备后才能发布；本阶段没有将其改为 `valid` 的接口。生产启用需另建私有对象存储、扫描与权利审核链路，并做隔离联调，不应通过修改开关绕过这些步骤。

## 2026-10-23 大文件导入增量

原阶段 1A 的 25 MiB 单次 multipart 限制仍适用于旧接口。管理后台现在对 25–256 MiB 原件使用新的私有分片接口：`POST /batches/:batchId/sources/:sourceId/uploads` 创建或恢复会话，`PUT /batches/:batchId/sources/:sourceId/uploads/:uploadId/chunk?offset=N` 上传不超过 8 MiB 的连续分片，`POST /batches/:batchId/sources/:sourceId/uploads/:uploadId/complete` 对完整原件校验后隔离保存。服务端记录断点并核验同名、大小和首尾样本指纹；完整 SHA-256 由服务端计算。会话和临时文件保留最长约 24 小时，过期后重新上传。此增量仍受本地开发环境开关约束，不代表正式环境可导入或原件可发布。
