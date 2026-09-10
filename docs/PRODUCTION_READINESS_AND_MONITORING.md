# 生产就绪检查与监控

## 发布前

本地发布准备只在唯一主项目 `D:\ChatGPT-Projects\求职小程序\jobapp-server` 执行。

```powershell
npm run check:release
npm run preflight:runtime:strict
```

严格预检不会输出密钥值，只检查数据库、登录、微信、AI 和支付配置是否齐全。支付启用时还要求 `REAL_PAYMENT_LAUNCH_APPROVED=true`。

## 服务探针

- 存活探针：`GET /api/health/live`
- 就绪探针：`GET /api/health/ready`

就绪探针的 HTTP 200 表示所有必需依赖可用；HTTP 503 表示不得切换生产流量。AI 未被声明为必需时，未配置会显示 `degraded`，但不会让基础服务退出负载均衡。

```powershell
$env:HEALTHCHECK_BASE_URL='https://api.zhiyincareer.com'
npm run healthcheck
```

## 当前唯一生产架构

- Node.js：20 LTS（`.nvmrc` 为唯一版本入口）。
- 应用端口：`4400`，只监听在 Nginx 后方。
- 应用根目录：`/www/wwwroot/zhiyincareer-main`。
- 不可变版本：`/www/wwwroot/zhiyincareer-main/releases/<run-id>-<commit>`。
- 当前版本软链接：`/www/wwwroot/zhiyincareer-main/current`。
- 共享配置：`/var/lib/jobapp-server/.env`，权限 `0600`。
- 共享数据：`/var/lib/jobapp-server/{db,uploads,data}`。
- 备份：`/www/backups/zhiyincareer`。
- PM2 进程：`jobapp-server`；Nginx upstream：`127.0.0.1:4400`。

GitHub Actions 的生产发布仅允许手动触发，并绑定 `production` Environment；推送 `main` 不会自动改动服务器。

## 腾讯云发布顺序

1. 备份生产数据库、`.env`、Nginx 配置和当前 PM2/systemd 配置。
2. 上传到新的版本目录，不覆盖当前运行目录或共享数据。
3. 使用隔离的临时数据库执行 `check:release`，随后对生产配置执行迁移 dry-run 和严格预检。
4. 对 `/api/health/ready`、登录、职位、V4、支付查单和回调验签做冒烟测试。
5. 仅当上述检查全部通过时原子切换 `current`，PM2 仍固定监听 4400，Nginx 无需重复改动。
6. 健康检查失败时脚本自动恢复上一个 `current` 并 reload PM2；数据库变更仍必须依靠发布前备份恢复。

## 历史部署证据（2026-07-27）

- 正确主项目版本：`5d7f7c5`
- 运行目录：`/www/wwwroot/zhiyincareer-main/releases/20260727-091741-5d7f7c5`
- 统一端口：`4400`
- Nginx：普通 API 和 `/api/v4/*` 均直接转发到 `4400`，不再进行 V4 路径重写
- 旧 `3001` PM2 服务：当时已停止；现行配置不再把它作为回滚入口
- 旧 `4300` systemd 服务：已停止并取消开机启动
- V4 数据迁移：用户、岗位、申请待迁移项均为 `0`
- 虚拟支付：`available=true`、`virtualConfigured=true`、`mock=false`
- 公网冒烟：readiness、V4、功能开关、职位、校招、支付和匿名鉴权均通过
- 审核开关：`home_recommendations=false`，只隐藏首页推荐岗位，完整职位功能保持开启
- 回滚与备份：`/www/backups/zhiyincareer/20260727-085923`
