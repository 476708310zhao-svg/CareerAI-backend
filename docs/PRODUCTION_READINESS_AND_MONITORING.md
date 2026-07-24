# 生产就绪检查与监控

## 发布前

所有命令都必须在唯一主项目 `C:\Users\admin\Desktop\求职小程序\jobapp-server` 执行。

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

## 腾讯云发布顺序

1. 备份生产数据库、`.env`、Nginx 配置和当前 PM2/systemd 配置。
2. 上传到新的版本目录，不覆盖当前运行目录。
3. 在新端口启动主项目，执行迁移 dry-run 和严格预检。
4. 对 `/api/health/ready`、登录、职位、V4、支付查单和回调验签做冒烟测试。
5. 仅当上述检查全部通过时切换 Nginx。
6. 保留上一版本和数据库备份；出现 5xx、登录失败或支付异常立即回滚。

当前生产同时存在 3001 主服务与 4300 历史 V4 副本，切流前不得直接删除 `/api/v4` 的 Nginx 规则。必须先把本主项目部署到隔离端口并完成兼容性验证。
