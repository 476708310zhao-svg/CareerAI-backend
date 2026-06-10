# 小程序上线前开发清单

> 目标：上线前消除后端启动、生产环境 mock、微信审核配置和包体性能风险。完成一项就打勾，并在验证记录里写清结果。

## 1. 必须先修

- [x] 后端可启动
  - 已声明 `nodemailer` 依赖。
  - `npm test` 已通过。

- [x] 支付 mock 不能进入正式环境
  - 生产环境缺微信支付配置时不允许走 mock。
  - 生产环境关闭 mock 支付确认接口。
  - 支付接口已统一为 `{ code, message, data }` 响应结构。
  - 未开通微信支付时生产 `.env` 使用 `PAYMENT_ENABLED=false`，不创建真实订单。

- [x] 微信登录缺配置不能生成开发用户
  - 生产环境缺 `WX_APP_ID` / `WX_APP_SECRET` 时直接报错。

- [x] 生产环境变量启动校验
  - 已新增 `utils/envValidation.js` 并接入 `server.js`。
  - 缺关键配置或仍使用占位值时，生产环境启动失败。
  - 已补充 `tests/envValidation.test.js` 防止回归。

- [x] 用户可见乱码拦截
  - 已修复 ATS 优化、一键申请、大厂直招页的异常提示乱码。
  - 已在 `scripts/check-data-content.js` 增加疑似 UTF-8 乱码扫描，后续发布检查会阻断可见乱码。

## 2. 微信审核与发布配置

- [x] 开启合法域名校验
  - `miniprogram/project.config.json` 已设置 `urlCheck: true`。

- [x] 正式上传关闭 SourceMap
  - `uploadWithSourceMap` 已设置为 `false`。

- [ ] 微信公众平台后台配置合法域名
  - request 合法域名：`api.zhiyincareer.com`
  - downloadFile 合法域名：`logo.clearbit.com`、`cdn.jsdelivr.net`、`cdn.simpleicons.org`、`tdesign.gtimg.com`
  - web-view 业务域名按实际上线链接单独配置。

- [x] 隐私协议与敏感权限说明
  - 已覆盖手机号、头像、录音、上传、订阅消息、web-view 和第三方服务说明。

## 3. 小程序包体与性能优化

- [x] 设计分包方案
  - 主包：入口、登录、TabBar、隐私页。
  - `package-ai`：AI 助手、AI 工作流、面试、音频评测、AI 报告。
  - `package-career`：简历、职业规划、项目生成、薪资、ATS、OA、Networking。
  - `package-content`：题库、经验详情、资讯、校招、web-view。
  - `package-agency`：机构详情、机构对比。
  - `package-user`：申请记录、收藏、消息、设置、VIP、公司和职位详情。

- [x] 实施分包迁移
  - 已移动页面目录。
  - 已更新 `app.json` 的 `subPackages`。
  - 已批量修正页面跳转路径。
  - 已修正分包页面中的 `utils/components/images` 相对引用。

- [ ] 微信开发者工具编译验证
  - 需要在开发者工具里重新编译。
  - 重点点击：首页、职位详情、搜索、AI 面试、简历、申请记录、机构详情、资讯详情、我的页面。

## 4. 最终发布前测试

- [x] 后端 smoke 测试
  - `npm test` 通过。

- [x] 小程序静态发布检查
  - `npm run check:miniprogram` 通过。
  - 已检查分包页面路径、相对 `require` 路径和 WXML 高风险表达式。
  - 已检查项目上传配置、运行时生产接口配置、tabBar 图标、JS/JSON 语法和包大小阈值。

- [ ] 小程序端人工回归
  - 需在微信开发者工具重新编译，并用体验版真机走一轮。
  - 登录/授权
  - 职位搜索与职位详情
  - 投递/申请记录
  - 收藏
  - AI 助手/AI 工作流
  - 简历/项目生成
  - 录音评测
  - 会员权益页：微信支付未开通前确认不出现真实收款入口；开通后再回归支付购买 VIP

- [ ] 正式提交与发布
  - 整理并提交本轮改动。
  - 推送并部署到服务器后，确认 `/api/payment/config` 返回标准响应且 `data.mock=false`。
  - 上传体验版。
  - 在微信公众平台补齐服务器域名和业务域名。

## 验证记录

| 日期 | 项目 | 结果 | 备注 |
| --- | --- | --- | --- |
| 2026-05-15 | 后端 smoke 测试 | 通过 | `npm test` 通过 |
| 2026-05-15 | 生产环境 mock 保护 | 通过 | 支付 mock、微信登录 dev openid、ASR、邮件、短信均已加生产保护 |
| 2026-05-15 | 小程序发布配置 | 通过 | 已开启 `urlCheck`，已关闭 `uploadWithSourceMap` |
| 2026-05-15 | 隐私协议与敏感权限 | 完成 | 已更新隐私页 |
| 2026-05-15 | 生产环境变量启动校验 | 通过 | 已补测试覆盖占位值和缺配置失败场景 |
| 2026-05-15 | 分包设计与实施 | 完成 | 已注册 5 个分包 |
| 2026-05-15 | 小程序静态发布检查 | 通过 | `npm run check:miniprogram` 通过，主包约 0.58 MB |
| 2026-05-15 | 发布前自动检查 | 通过 | `npm run check:release` 通过，覆盖后端 smoke + 小程序静态发布检查 |
| 2026-06-10 | 用户可见乱码修复 | 通过 | 修复 ATS、一键申请、大厂直招异常提示，并新增乱码扫描 |
| 2026-06-10 | 支付接口结构与生产 mock 保护 | 通过 | 支付接口统一 `{ code, message, data }`；生产未配置支付时不可用且不走 mock |
| 2026-06-10 | 发布前自动检查 | 通过 | `npm run check:release` 通过：29 个测试、小程序静态检查、数据检查均通过 |
