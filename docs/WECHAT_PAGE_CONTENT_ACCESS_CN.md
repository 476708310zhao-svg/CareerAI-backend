# 微信小程序页面内容接入配置

更新时间：2026-06-25

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
package-content/pages/question-detail/question-detail?id=示例题目ID
package-content/pages/star-library/star-library
pages/campus/campus
package-content/pages/campus-detail/campus-detail?id=示例校招ID
pages/agencies/agencies
package-agency/pages/agency-detail/agency-detail?id=示例机构ID
package-content/pages/news/news
package-content/pages/news-detail/news-detail?id=示例资讯ID
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
- `miniprogram/sitemap.json` 已只允许公开内容页收录。
- `miniprogram/page-meta.json` 已整理页面名称、分类、参数和摘要，可作为后台填报清单。

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
