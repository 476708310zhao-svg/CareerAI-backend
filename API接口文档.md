# API 接口文档

> 后端服务地址：`https://api.zhiyincareer.com`  
> 本地开发地址：`http://localhost:3001`  
> 所有需要登录的接口请在 Header 中传入：`Authorization: Bearer <token>`

---

## 目录

- [外部第三方 API](#外部第三方-api)
- [用户 /api/users](#用户-apiusers)
- [职位 /api/jobs](#职位-apijobs)
- [求职申请 /api/applications](#求职申请-apiapplications)
- [面经题库 /api/experiences](#面经题库-apiexperiences)
- [薪资 /api/salaries](#薪资-apisalaries)
- [公司 /api/companies](#公司-apicompanies)
- [评论 /api/comments](#评论-apicomments)
- [收藏 /api/favorites](#收藏-apifavorites)
- [消息 /api/messages](#消息-apimessages)
- [AI 功能 /api/ai](#ai-功能-apiai)
- [资讯 /api/news](#资讯-apinews)
- [中介机构 /api/agencies](#中介机构-apiagencies)
- [校招 /api/campus](#校招-apicampus)
- [简历 /api/resumes](#简历-apiresumes)
- [文件上传 /api/upload](#文件上传-apiupload)
- [语音转文字 /api/asr](#语音转文字-apiasr)
- [支付 /api/payment](#支付-apipayment)
- [反馈 /api/feedback](#反馈-apifeedback)

---

## 外部第三方 API

| 服务 | 提供方 | 用途 | 价格 | 降级策略 |
|------|--------|------|------|----------|
| JSearch | RapidAPI | 职位搜索主力（北美） | 免费 200次/月，付费 $10/月起 | 失败自动切 Adzuna |
| **Adzuna** | Adzuna | 职位搜索备用（美/英/加/澳/新加坡等） | **免费 100次/天** | Adzuna 失败切本地数据 |
| **RemoteOK** | RemoteOK | 远程职位专区 | **完全免费，无需 Key** | 失败切本地远程职位 |
| DeepSeek | DeepSeek | 所有 AI 功能底层模型 | 按 token 计费 | 无降级，失败返回错误提示 |
| 微信登录 | 微信官方 | openid 获取、手机号授权 | 免费 | 无真实 AppID 时使用 dev_ 前缀模拟 |
| 微信支付 | 微信官方 | VIP 会员购买 JSAPI v2 | 按交易收费 | 未配置时自动切换 Mock 模式 |
| 腾讯云 ASR | 腾讯云 | 语音转文字（面试模拟语音输入） | 按用量计费 | 无降级，失败返回错误提示 |

### 职位搜索降级链

```
前端请求 /api/jobs/search
    ↓
JSearch（RapidAPI）── 成功 ──→ 返回结果
    ↓ 失败/配额超限
Adzuna ── 成功 ──→ 返回结果
    ↓ 失败
本地 jobs.json（100条种子数据）──→ 返回结果

前端请求 /api/jobs/remote（远程职位专区）
    ↓
RemoteOK ── 成功 ──→ 返回结果
    ↓ 失败
本地 jobs.json 中 remote 类型职位
```

---

## 用户 /api/users

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| POST | `/api/users/login` | 否 | 微信授权登录，传 `code`，返回 token |
| POST | `/api/users/phone-login` | 否 | 手机号快速登录，传 `phoneCode` + `loginCode` |
| POST | `/api/users/web-login` | 否 | 网页端账号密码登录，传 `account` + `password` |
| POST | `/api/users/web-register` | 否 | 网页端注册，传 `nickname/email/phone/password` |
| POST | `/api/users/refresh-token` | 是 | 刷新 token，返回新 token |
| GET | `/api/users/profile` | 是 | 获取当前用户信息 |
| PUT | `/api/users/profile` | 是 | 更新用户详情（nickname/email/phone/education/jobPreference） |
| POST | `/api/users/update-profile` | 是 | 更新昵称和头像（nickname/avatar） |
| GET | `/api/users/resumes` | 是 | 获取简历列表 |
| GET | `/api/users/resumes/:id` | 是 | 获取单份简历详情 |
| POST | `/api/users/resumes` | 是 | 创建简历 |
| PUT | `/api/users/resumes/:id` | 是 | 更新简历 |

---

## 职位 /api/jobs

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/jobs/search` | 否 | 职位搜索（JSearch → Adzuna → 本地三级降级），参数：`query/page/num_pages/country/date_posted/employment_types` |
| GET | `/api/jobs/remote` | 否 | **远程职位专区**（RemoteOK，免费），参数：`query/tag/page/pageSize`；失败自动降级本地数据 |
| GET | `/api/jobs/featured` | 否 | **The Muse 精选职位**（完全免费），参数：`query/category/level/location/page`；category 可选 software/data/product/design/finance 等 |
| GET | `/api/jobs/linkedin` | 否 | **LinkedIn Jobs**（需 RapidAPI 订阅），参数：`query/location/page` |
| GET | `/api/jobs/indeed` | 否 | **Indeed Jobs**（需 RapidAPI 订阅），参数：`query/location/page` |
| GET | `/api/jobs/detail` | 否 | 职位详情，参数：`job_id` |
| GET | `/api/jobs/salary` | 否 | RapidAPI 薪资估算，参数：`job_title/location` |
| GET | `/api/jobs/recommend/list` | 否 | 随机推荐 5 条本地职位 |
| GET | `/api/jobs/companies/list` | 否 | 本地公司列表 |
| GET | `/api/jobs/filters/options` | 否 | 筛选选项（地区/行业/职位类型） |
| GET | `/api/jobs` | 否 | 本地职位列表，支持筛选：`keyword/region/industry/jobType/visaSponsored/page/pageSize` |
| GET | `/api/jobs/:id` | 否 | 本地职位详情 |

---

## 求职申请 /api/applications

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/applications` | 是 | 获取投递记录列表 |
| GET | `/api/applications/:id` | 是 | 获取单条投递记录 |
| POST | `/api/applications` | 是 | 新增投递记录 |
| DELETE | `/api/applications/:id` | 是 | 删除投递记录 |

---

## 面经题库 /api/experiences

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/experiences` | 否 | 面经列表，支持筛选：`keyword/company/position/page/pageSize` |
| GET | `/api/experiences/:id` | 否 | 面经详情 |
| POST | `/api/experiences` | 是 | 发布面经 |
| POST | `/api/experiences/:id/like` | 是 | 点赞面经 |
| DELETE | `/api/experiences/:id` | 是 | 删除面经（仅本人） |

---

## 薪资 /api/salaries

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/salaries/market` | 否 | 市场薪资聚合（本地DB → RapidAPI → DeepSeek AI 三级降级），参数：`job_title/location/company/region` |
| GET | `/api/salaries/statistics` | 否 | 薪资统计，参数：`position/currency` |
| GET | `/api/salaries` | 否 | 薪资列表，支持筛选：`position/company/region/page/pageSize` |
| POST | `/api/salaries` | 是 | 提交薪资报告 |

---

## 公司 /api/companies

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/companies` | 否 | 公司列表，支持筛选：`keyword/industry/country/page/pageSize` |
| GET | `/api/companies/:id` | 否 | 公司详情（含职位数、面经数、薪资摘要） |

---

## 评论 /api/comments

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/comments/:experienceId` | 否 | 获取面经评论列表 |
| POST | `/api/comments` | 是 | 发布评论 |
| POST | `/api/comments/:commentId/reply` | 是 | 回复评论 |
| POST | `/api/comments/:commentId/like` | 是 | 点赞评论 |
| DELETE | `/api/comments/:id` | 是 | 删除评论（仅本人） |

---

## 收藏 /api/favorites

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/favorites` | 是 | 收藏列表，支持参数：`type`（job/experience/company） |
| POST | `/api/favorites` | 是 | 添加收藏，传 `type + targetId` |
| DELETE | `/api/favorites` | 是 | 取消收藏，传 `type + targetId` |
| GET | `/api/favorites/check` | 是 | 检查是否已收藏，参数：`type + targetId` |

---

## 消息 /api/messages

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/messages` | 是 | 消息列表 |
| GET | `/api/messages/unread-count` | 是 | 未读消息数量 |
| PUT | `/api/messages/:id/read` | 是 | 标记单条消息已读 |
| PUT | `/api/messages/read-all` | 是 | 全部标记已读 |

---

## AI 功能 /api/ai

> 所有 AI 接口均使用 DeepSeek 大模型，限流 10次/分钟

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| POST | `/api/ai/assistant` | 否 | AI 求职助手对话（SSE 流式输出），传 `messages[]` + 可选 `userContext` |
| POST | `/api/ai/chat` | 否 | AI 通用对话，传 `messages[]` |
| POST | `/api/ai/career-plan` | 否 | AI 生成职业规划，传用户背景信息 |
| POST | `/api/ai/project-builder` | 否 | AI 生成/优化项目经历描述 |
| POST | `/api/ai/workflow` | 否 | AI 工作流（多步骤任务编排） |

---

## 资讯 /api/news

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/news` | 否 | 求职资讯列表，支持参数：`category/page/pageSize` |

---

## 中介机构 /api/agencies

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/agencies` | 否 | 中介列表，支持筛选：`keyword/type/country/page/pageSize` |
| GET | `/api/agencies/compare` | 否 | 多家中介对比，参数：`ids`（逗号分隔） |
| GET | `/api/agencies/:id` | 否 | 中介详情 |
| GET | `/api/agencies/:id/reviews` | 否 | 中介用户评价列表 |
| POST | `/api/agencies/:id/reviews` | 是 | 提交中介评价 |
| POST | `/api/agencies/:id/reviews/:reviewId/like` | 是 | 点赞评价 |
| DELETE | `/api/agencies/reviews/:reviewId` | 是 | 删除评价（仅本人） |
| POST | `/api/agencies/:id/ai-eval` | 否 | AI 生成中介综合评估报告 |
| POST | `/api/agencies/batch-info` | 否 | 批量获取中介卡片信息 |

---

## 校招 /api/campus

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/campus` | 否 | 校招日历列表，支持筛选：`company/month/year/page/pageSize` |
| GET | `/api/campus/meta` | 否 | 校招筛选元数据（公司列表、月份等） |
| GET | `/api/campus/:id` | 否 | 校招详情 |

---

## 简历 /api/resumes

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| GET | `/api/resumes` | 是 | 简历列表 |
| GET | `/api/resumes/:id` | 是 | 简历详情 |
| POST | `/api/resumes` | 是 | 创建简历 |
| PUT | `/api/resumes/:id` | 是 | 更新简历 |
| DELETE | `/api/resumes/:id` | 是 | 删除简历 |

---

## 文件上传 /api/upload

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| POST | `/api/upload/avatar` | 是 | 上传用户头像，返回 `{ url }` |

---

## 语音转文字 /api/asr

> 使用腾讯云 ASR 一句话识别，支持 mp3/wav/silk/webm，文件限制 5MB

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| POST | `/api/asr/transcribe` | 否 | 上传音频文件转文字，返回识别结果 |
| GET | `/api/asr/config` | 否 | 获取 ASR 配置信息 |

---

## 支付 /api/payment

> 微信支付 JSAPI v2，未配置 MCH_ID 时自动切换 Mock 模式

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| POST | `/api/payment/create-order` | 是 | 创建支付订单（VIP 购买），返回微信支付参数 |
| POST | `/api/payment/notify` | 否 | 微信支付回调通知（由微信服务器调用） |
| POST | `/api/payment/mock-confirm` | 否 | Mock 模式手动确认支付（仅开发测试） |
| GET | `/api/payment/verify/:orderNo` | 是 | 查询订单支付状态 |
| GET | `/api/payment/config` | 否 | 获取支付配置（套餐列表） |
| GET | `/api/payment/orders` | 是 | 获取当前用户订单历史 |

---

## 反馈 /api/feedback

| 方法 | 路径 | 是否需登录 | 说明 |
|------|------|-----------|------|
| POST | `/api/feedback` | 否 | 提交用户反馈，传 `content` + 可选 `contact` |

---

## 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查，返回服务状态 |
| GET | `/api/logo` | 公司 Logo 获取/生成，参数：`name`，无图时返回 SVG 占位图 |

---

---

## 待接入接口清单

> 按优先级排列，接入完成后标注 ✅

### 职位搜索类

| 状态 | 接口 | 提供方 | 价格 | 说明 |
|------|------|--------|------|------|
| ✅ 已接入 | JSearch | RapidAPI | 免费200次/月 | 北美职位主力数据源 |
| ✅ 已接入 | Adzuna | Adzuna | 免费100次/天 | 多国职位备用数据源，需配置 ADZUNA_APP_ID / ADZUNA_APP_KEY |
| ✅ 已接入 | RemoteOK | RemoteOK | 完全免费 | 远程职位专区，无需 Key，`/api/jobs/remote` |
| ✅ 已接入 | The Muse | The Muse | 完全免费 | 精选科技/创业公司职位，`/api/jobs/featured`，支持分类/级别/地区筛选 |
| ✅ 已接入（待激活） | LinkedIn Jobs | RapidAPI | 免费100次/月 | `/api/jobs/linkedin`，需在 RapidAPI 订阅 linkedin-jobs-search，复用现有 Key |
| ✅ 已接入（待激活） | Indeed | RapidAPI | 免费200次/月 | `/api/jobs/indeed`，需在 RapidAPI 订阅 indeed12，复用现有 Key |
| ⬜ 跳过 | We Work Remotely | RapidAPI | 免费 | RemoteOK 已覆盖远程职位，价值重复，暂不接入 |

### 公司信息类

| 状态 | 接口 | 提供方 | 价格 | 说明 |
|------|------|--------|------|------|
| ⬜ 待接入 | Glassdoor | RapidAPI | 需申请 | 公司评价 + 薪资 + 面试评价，一个接口同时获取三类数据 |
| ⬜ 待接入 | Clearbit Logo API | Clearbit | 免费 | 通过公司域名获取高清 Logo，提升公司卡片显示效果 |

### 薪资数据类

| 状态 | 接口 | 提供方 | 价格 | 说明 |
|------|------|--------|------|------|
| ✅ 已接入 | JSearch 薪资估算 | RapidAPI | 含在 JSearch 配额内 | 按职位+城市估算薪资范围 |
| ✅ 已接入 | DeepSeek AI 薪资估算 | DeepSeek | 按 token 计费 | 本地DB和 RapidAPI 均无数据时的 AI 兜底 |
| ⬜ 待接入 | Levels.fyi | 第三方 | 需申请 | 科技大厂精确薪资数据（TC、Base、Bonus 分项） |

### 国内就业类

| 状态 | 接口 | 提供方 | 价格 | 说明 |
|------|------|--------|------|------|
| ⬜ 待接入 | 前程无忧 51job | 51job | 需商务合作 | 国内职位主力平台，回国就业方向 |
| ⬜ 待接入 | 智联招聘 | 智联 | 需商务合作 | 国内职位补充数据源 |

### 配置说明

接入新接口后，在服务器 `.env` 文件中添加对应密钥，并重启服务：
```bash
pm2 restart jobapp-server
```

*最后更新：2026-05-09*
