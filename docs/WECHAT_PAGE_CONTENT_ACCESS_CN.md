# 微信小程序页面内容接入配置

更新时间：2026-10-20

## 后台填写建议

小程序页面内容接入建议只配置公开内容页，避免把用户个人数据、支付、消息、收藏、简历编辑和 AI 会话类页面提交给搜索/内容索引。

品牌/小程序名称：

```text
职引
```

内容简介：

```text
职引是面向留学生和新职人的求职助手，提供岗位搜索、校招日历、面试题库、公司资料、薪资参考和求职资讯。
```

核心页面路径：

```text
pages/index/index
pages/jobs/jobs
package-user/pages/job-detail/job-detail?id=示例职位ID
pages/experiences/experiences
package-content/pages/experience-detail/experience-detail?id=示例面经ID
package-content/pages/star-library/star-library
pages/campus/campus
package-content/pages/campus-detail/campus-detail?id=示例校招ID
pages/agencies/agencies
package-agency/pages/agency-detail/agency-detail?id=示例机构ID
package-content/pages/news/news
package-content/pages/bigtech-jobs/bigtech-jobs
package-user/pages/companies/companies
package-user/pages/company-detail/company-detail?id=示例公司ID
package-career/pages/salary/salary
package-career/pages/skill-pathways/skill-pathways
package-career/pages/job-insights/job-insights
package-career/pages/oa-bank/oa-bank
```

## 已在代码内配置

- `miniprogram/app.json` 已配置 `sitemapLocation: "sitemap.json"`。
- `miniprogram/sitemap.json` 允许 18 个可公开访问的列表或详情页参与索引；这只控制索引资格，不代表微信已经收录。
- `miniprogram/page-meta.json` 已整理页面名称、分类、参数和摘要，可作为后台填报清单。
- `miniprogram/app.json` 已声明岗位、校招、面经三套只读微信 AI Skill。此配置仍需使用已获开发模式权限的 AppID 在微信开发者工具及平台评测中验证；AI 能力与搜一搜收录分别验收。

## 暂不提交索引的页面

- `package-content/pages/news-detail/news-detail`：目前依赖上一页写入的本机缓存，直接从搜索打开无法按 `id` 拉取正文；分享也跳到资讯列表。先改成稳定的服务端详情接口，再恢复收录。
- `package-content/pages/question-detail/question-detail`：只在本机缓存或内置题库找到题目；部分动态题目直达时显示“题目加载失败”。先补稳定的按 `id` 取题目能力。
- `package-agency/pages/agency-compare/agency-compare`：用户临时选择的对比组合，不是固定内容详情。
- `package-user/pages/search/search`：空搜索页没有独立内容价值。

公司详情的真实分享链接只带 `id`，因此 sitemap 的参数要求也改为仅 `id`。

## 不建议接入的页面

以下页面属于用户私域、登录后能力、支付权益或外部链接承载页，不建议加入页面内容接入：

```text
pages/profile/profile
package-user/pages/applications/applications
package-user/pages/apply-form/apply-form
package-user/pages/profile-edit/profile-edit
package-user/pages/favorites/favorites
package-user/pages/messages/messages
package-user/pages/vip/vip
package-career/pages/resume/resume
package-career/pages/career-planner/career-planner
package-career/pages/project-builder/project-builder
package-career/pages/offer-compare/offer-compare
package-career/pages/ats-optimize/ats-optimize
package-career/pages/networking/networking
package-ai/pages/ai-assistant/ai-assistant
package-ai/pages/interview-setup/interview-setup
package-ai/pages/interview-dialog/interview-dialog
package-ai/pages/ai-report/ai-report
package-content/pages/webview/webview
```
